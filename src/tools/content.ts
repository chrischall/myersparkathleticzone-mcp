import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { VERSION } from '../version.js';

export function registerContentTools(server: McpServer): void {
  server.registerTool(
    'mpaz_list_news',
    {
      title: 'List news posts',
      description: 'Recent news posts from the athletics site homepage, newest first. Read-only.',
      annotations: toolAnnotations({ title: 'List news posts', readOnly: true, idempotent: true, openWorld: true }),
      inputSchema: {},
    },
    async () => {
      const news = await client.entities('/', 'news');
      news.sort((a, b) => String(b.publishedDatetimeUtc ?? '').localeCompare(String(a.publishedDatetimeUtc ?? '')));
      return textResult({ count: news.length, news });
    },
  );

  server.registerTool(
    'mpaz_list_videos',
    {
      title: 'List game broadcast links',
      description:
        'Games with a broadcast link. These are NFHS Network links rather than hosted clips, so ' +
        '`videoLengthSeconds` is 0 on every entry and `title` is the team name — that is expected, not missing data. ' +
        'Read-only.',
      annotations: toolAnnotations({
        title: 'List game broadcast links',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {},
    },
    async () => {
      const videos = await client.entities('/', 'videos');
      return textResult({
        count: videos.length,
        note: 'Links to NFHS Network broadcasts; durations are not published.',
        videos,
      });
    },
  );

  server.registerTool(
    'mpaz_list_photo_galleries',
    {
      title: 'List photo galleries',
      description:
        'Photo galleries published on the site. Images sit on a public CDN and can be fetched directly, no auth. ' +
        'Read-only.',
      annotations: toolAnnotations({ title: 'List photo galleries', readOnly: true, idempotent: true, openWorld: true }),
      inputSchema: {},
    },
    async () => {
      const galleries = await client.entities('/media/photos', 'galleries');
      return textResult({ count: galleries.length, galleries });
    },
  );

  server.registerTool(
    'mpaz_healthcheck',
    {
      title: 'Check the site is reachable',
      description:
        'Verify the athletics site is reachable and still serving a parseable RSC payload. Reports the configured ' +
        'site and school id. Read-only.',
      annotations: toolAnnotations({
        title: 'Check the site is reachable',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {},
    },
    async () => {
      const started = Date.now();
      let ok = true;
      let detail = 'homepage returned a parseable RSC payload';
      let newsCount = 0;
      try {
        newsCount = (await client.entities('/', 'news')).length;
      } catch (err) {
        ok = false;
        detail = err instanceof Error ? err.message : String(err);
      }
      return textResult({
        ok,
        version: VERSION,
        siteUrl: client.siteUrl,
        schoolId: client.schoolId,
        auth: 'none required — all data is public',
        newsCount,
        elapsedMs: Date.now() - started,
        detail,
      });
    },
  );
}
