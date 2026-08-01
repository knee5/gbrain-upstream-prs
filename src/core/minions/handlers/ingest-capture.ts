/**
 * `ingest_capture` Minion job handler. Receives an IngestionEvent payload
 * from the daemon's dispatcher (or the webhook source's POST /ingest
 * handler) and routes it through `importFromContent` to land as a brain
 * page.
 *
 * Trust posture (E1 + eng-review decisions):
 *   - The event's `untrusted_payload` flag is preserved on the job's
 *     result for audit. For untrusted OAuth webhook jobs, the database write
 *     source comes from the server-stamped `job.data.target_source_id`, never
 *     from caller-controlled event provenance. Missing or stale target-source
 *     state fails closed.
 *   - Auto-link runs at the put_page operation layer, which we deliberately
 *     bypass here. importFromContent still receives `remote: true` for an
 *     untrusted webhook so gate-owned markers are stripped and import-time
 *     code-reference edges are disabled. The content lands as a page without
 *     acquiring a second graph-write surface.
 *
 * Slug resolution (in order):
 *   1. `job.data.slug` if caller provided one
 *   2. `job.data.metadata.slug` if event metadata carried one
 *   3. Generated default: `inbox/YYYY-MM-DD-<hash6>` using the event's
 *      content_hash prefix. Stable for the same content.
 *
 * The default slug deliberately lives under `inbox/` — that's the
 * triage convention the user will discover when reviewing recent
 * captures. A downstream skill (post-capture-triage) can promote inbox
 * pages to canonical homes later.
 */

import type { MinionJobContext } from '../types.ts';
import type { BrainEngine } from '../../engine.ts';
import type { IngestionEvent } from '../../ingestion/types.ts';
import { validateIngestionEvent } from '../../ingestion/types.ts';
import { importFromContent } from '../../import-file.ts';

export interface IngestCaptureResult {
  slug: string;
  status: 'imported' | 'skipped' | 'error';
  chunks: number;
  untrusted_payload: boolean;
  source_kind: string;
  source_uri: string;
}

/** Builds the default slug for an event when the caller didn't provide one. */
export function defaultSlugForEvent(event: IngestionEvent, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hashPrefix = event.content_hash.slice(0, 6);
  return `inbox/${y}-${m}-${d}-${hashPrefix}`;
}

export function makeIngestCaptureHandler(engine: BrainEngine) {
  return async function ingestCaptureHandler(job: MinionJobContext): Promise<IngestCaptureResult> {
    const data = job.data as {
      event?: unknown;
      slug?: unknown;
      target_source_id?: unknown;
      oauth_ingest_payload_version?: unknown;
      noEmbed?: unknown;
    };
    const event = data.event as IngestionEvent | undefined;
    if (!event) {
      throw new Error('ingest_capture: job.data.event is required');
    }
    const validationErr = validateIngestionEvent(event);
    if (validationErr) {
      throw new Error(`ingest_capture: invalid event payload: ${validationErr.message}`);
    }

    // Slug resolution.
    let slug: string;
    if (typeof data.slug === 'string' && data.slug.length > 0) {
      slug = data.slug;
    } else if (
      event.metadata &&
      typeof (event.metadata as Record<string, unknown>).slug === 'string'
    ) {
      slug = (event.metadata as Record<string, unknown>).slug as string;
    } else {
      slug = defaultSlugForEvent(event);
    }

    // Untrusted-payload posture. The flag is preserved for audit and passed
    // into importFromContent so page-content trust gates stay active even
    // though this worker bypasses the put_page operation wrapper.
    const untrustedPayload = event.untrusted_payload === true;

    // For text-typed events, content is the inline markdown/text. For
    // binary types (image/audio/video/pdf), content is a path-or-URI that
    // the content-type processor pipeline transforms. The v1 wave lands
    // the text path; processors arrive in subsequent commits.
    const isText =
      event.content_type === 'text/markdown' ||
      event.content_type === 'text/plain' ||
      event.content_type === 'text/html' ||
      event.content_type === 'application/json' ||
      event.content_type === 'unknown';

    if (!isText) {
      // Binary content without a processor would land as a path-string
      // page, which isn't useful. Surface as job-level error so the
      // operator sees the gap in `gbrain doctor` and can decide whether
      // to install the appropriate skillpack-distributed processor.
      throw new Error(
        `ingest_capture: content_type '${event.content_type}' requires a content-type ` +
          `processor that is not yet installed. Install a processor skillpack ` +
          `(e.g. gbrain-audio-transcribe, gbrain-image-ocr) or pre-extract the ` +
          `content to text/markdown before emitting.`,
      );
    }

    // noEmbed defaults to true. Mirrors the sync handler's pattern:
    // embed runs as a separate Minion job (autopilot's embed phase OR an
    // explicit `gbrain embed --stale`). Callers can opt in to inline embed
    // by passing { noEmbed: false } in job.data.
    const noEmbed = data.noEmbed !== false;

    // #1522: thread the validated event's provenance into the page write
    // instead of dropping it on the floor. source_kind / source_uri are
    // pure provenance strings (no scoping power) and persist
    // unconditionally via importFromContent's putPage write-through.
    //
    // event.source_id is the emitter's IngestionSource instance id, NOT
    // necessarily a registered brain source. Trusted local ingestion keeps
    // its existing behavior: a registered event source routes the write,
    // while an unregistered emitter lands in `default`.
    //
    // An untrusted OAuth webhook event is different. Its event.source_id is
    // caller-controlled provenance, so only POST /ingest's server-stamped
    // job.data.target_source_id may route the write.
    //
    // Queue compatibility:
    //   v2               — current envelope; the server stamp is mandatory.
    //   unversioned+stamp— jobs queued by the immediately preceding release;
    //                      honor the already-authenticated stamp.
    //   unversioned      — older jobs that predate source stamping; route to
    //                      `default`, never to caller-controlled event.source_id.
    //
    // This lets a rolling deploy drain durable pre-upgrade work without
    // weakening the trust boundary for any newly emitted job.
    let sourceId: string | undefined;
    const stampedTarget = typeof data.target_source_id === 'string'
      ? data.target_source_id.trim()
      : '';
    let candidateSourceId: string;
    if (!untrustedPayload) {
      candidateSourceId = event.source_id;
    } else if (data.oauth_ingest_payload_version === 2) {
      if (stampedTarget.length === 0) {
        throw new Error(
          'ingest_capture: v2 untrusted payload requires server-stamped job.data.target_source_id',
        );
      }
      candidateSourceId = stampedTarget;
    } else if (data.oauth_ingest_payload_version === undefined) {
      candidateSourceId = stampedTarget || 'default';
    } else {
      throw new Error(
        `ingest_capture: unsupported oauth_ingest_payload_version '${String(data.oauth_ingest_payload_version)}'`,
      );
    }
    const rows = await engine.executeRaw<{ id: string }>(
      `SELECT id FROM sources WHERE id = $1`,
      [candidateSourceId],
    );
    if (rows.length > 0) {
      sourceId = candidateSourceId;
    } else if (untrustedPayload) {
      throw new Error(
        `ingest_capture: target source '${candidateSourceId}' is not registered`,
      );
    }

    const result = await importFromContent(engine, slug, event.content, {
      noEmbed,
      sourceId,
      source_kind: event.source_kind,
      source_uri: event.source_uri,
      ingested_via: 'ingest_capture',
      remote: untrustedPayload,
    });

    return {
      slug,
      status: result.status,
      chunks: result.chunks,
      untrusted_payload: untrustedPayload,
      source_kind: event.source_kind,
      source_uri: event.source_uri,
    };
  };
}
