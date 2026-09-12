import { useEffect, useState } from 'react';
import { FLUXNODE_INFO_API_URL } from 'app-buildinfo';
import { hostInfoSegments } from './hostInfo';

/*
 * Fetches /api/v1/header once and turns it into footer segments (issue #145).
 *
 * Fails SILENTLY to an empty list on purpose. This endpoint only exists where
 * the Rust API is deployed alongside nginx -- a static-only build, a dev server,
 * or an older image will 404, and none of those are errors worth telling
 * anybody about. The footer simply looks the way it did before this feature.
 *
 * Fetched once per mount rather than polled: the location never changes for the
 * life of the process, and uptime moving by a few minutes is not worth a timer
 * on a component that is on every single page.
 */
export function useHostInfo() {
  const [segments, setSegments] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`${FLUXNODE_INFO_API_URL}/api/v1/header`, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) return;
        const json = await response.json();
        if (cancelled || !json?.success) return;
        setSegments(hostInfoSegments(json));
      } catch {
        // No API here. Nothing to say, nothing to log.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return segments;
}
