import { request } from "undici";
import { load } from "cheerio";
import { Utils } from "../utils/Utils";

const APP_SCRIPT_CLIENT_ID_REGEX = /,client_id:"(.*?)"/;
const YOUTUBE_REGEX = /json && json\((.*)\)/;

export class Autocomplete {
  private soundcloudClientId: string | null = null;

  private bilibili(term: string): Promise<AutocompleteResult[]> {
    const params = new URLSearchParams({
      func: "suggest",
      suggest_type: "accurate",
      sub_type: "tag",
      main_ver: "v1",
      tag_num: "25",
      term,
    });
    return request(
      `https://s.search.bilibili.com/main/suggest?${params.toString()}`
    )
      .then((r) => r.body.json())
      .then((r) => {
        const arr = r?.result?.tag ?? [];
        if (arr.length === 0) return arr;
        return arr
          .splice(0, 25)
          .map(
            ({
              name,
              value,
              term: t,
            }: {
              name: string;
              value: string;
              term: string;
            }) => ({
              name: Utils.limit(name || value || t, 97),
              value: Utils.limit(name || value || t, 97),
            })
          );
      })
      .catch(() => []);
  }

  private mixcloud(term: string): Promise<AutocompleteResult[]> {
    return request("https://www.mixcloud.com/graphql", {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        query:
          "query SearchCloudcastResultsQuery($term: String!) { viewer { search { searchQuery(term: $term) { cloudcasts(first: 25) { edges { node { name isExclusive } } } } } }  }",
        variables: { term },
      }),
    })
      .then((r) => r.body.json())
      .then((r) =>
        r.data.viewer.search.searchQuery.cloudcasts.edges
          .filter(
            (a: { node: { isExclusive: boolean; name: string } }) =>
              !a.node.isExclusive
          )
          .map((a: { node: { isExclusive: boolean; name: string } }) => ({
            name: Utils.limit(a.node.name, 97),
            value: Utils.limit(a.node.name, 97),
          }))
      )
      .catch(() => []);
  }

  private odysee(s: string): Promise<AutocompleteResult[]> {
    return request(
      `https://lighthouse.odysee.com/search?${new URLSearchParams({
        s,
        size: "25",
      })}`,
      { method: "GET" }
    )
      .then((r) => r.body.json())
      .then((r) =>
        r.map((a: { name: string }) => ({
          name: Utils.limit(a.name, 97),
          value: Utils.limit(a.name, 97),
        }))
      )
      .catch(() => []);
  }

  private async soundcloud(q: string): Promise<AutocompleteResult[]> {
    if (this.soundcloudClientId === null) await this.fetchSoundcloudClientId();
    if (this.soundcloudClientId === null) return [];
    const params = new URLSearchParams({
      limit: "25",
      offset: "0",
      q,
      client_id: this.soundcloudClientId,
    });
    return request(
      `https://api-v2.soundcloud.com/search/queries?${params.toString()}`,
      { method: "GET" }
    )
      .then(async (r) => {
        if (r.statusCode === 401) {
          this.soundcloudClientId = null;
          return this.soundcloud(q);
        }
        if (r.statusCode === 200) {
          const json = await r.body.json();
          return json.collection
            .splice(0, 25)
            .map(({ query, output }: { query: string; output: string }) => ({
              name: Utils.limit(query, 97),
              value: Utils.limit(output, 97),
            }));
        }
        return [];
      })
      .catch(() => []);
  }

  private async fetchSoundcloudClientId() {
    const $ = await request("https://soundcloud.com", { method: "GET" }).then(
      async (r) => load(await r.body.json())
    );
    const elements = $('script[src*="sndcdn.com/assets/"][src$=".js"]').get();
    elements.reverse();

    for (let i = 0; i < elements.length; i++) {
      const { src } = elements[i].attribs;
      if (src) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const srcContent = await request(src, { method: "GET" }).then((r) =>
            r.body.text()
          );
          const result = APP_SCRIPT_CLIENT_ID_REGEX.exec(srcContent);
          if (!result) {
            this.soundcloudClientId = null;
            return null;
          }
          // eslint-disable-next-line prefer-destructuring
          this.soundcloudClientId = result[1];
          return result[1];
          // eslint-disable-next-line no-empty
        } catch (_) {}
      }
    }

    this.soundcloudClientId = null;
    return null;
  }

  private vimeo(q: string): Promise<AutocompleteResult[]> {
    return request(
      `https://vimeo.com/search/autocomplete?q=${encodeURIComponent(q)}`,
      {
        method: "GET",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      }
    )
      .then((r) => r.body.json())
      .then((r) =>
        r.options
          .splice(0, 25)
          .filter((a: { type: string }) => a.type === "suggestion")
          .map((a: { text: string }) => ({
            name: Utils.limit(a.text, 97),
            value: Utils.limit(a.text, 97),
          }))
      )
      .catch(() => []);
  }

  private youtube(q: string): Promise<AutocompleteResult[]> {
    const params = new URLSearchParams({
      client: "youtube",
      ds: "yt",
      callback: "json",
      q,
    });
    return request(
      `https://suggestqueries-clients6.youtube.com/complete/search?${params.toString()}`,
      { method: "GET" }
    )
      .then((r) => r.body.arrayBuffer())
      .then((r) => {
        const result = YOUTUBE_REGEX.exec(Buffer.from(r).toString());
        if (result) {
          const json = JSON.parse(result[1])[1];
          if (json && Array.isArray(json) && json.length > 0)
            return json.splice(0, 25).map((o) => ({
              name: Utils.limit(o[0], 97),
              value: Utils.limit(o[0], 97),
            }));
        }
        return [];
      })
      .catch(() => []);
  }

  public handle(input: string, source: string): Promise<AutocompleteResult[]> {
    switch (source.toLowerCase()) {
      case "yt":
      case "youtube":
        return this.youtube(input);
      case "sc":
      case "soundcloud":
        return this.soundcloud(input);
      case "bili":
      case "bilibili":
      case "bl":
        return this.bilibili(input);
      case "vimeo":
      case "vm":
        return this.vimeo(input);
      case "odysee":
      case "od":
        return this.odysee(input);
      case "mixcloud":
      case "mx":
        return this.mixcloud(input);
      default:
        return Promise.resolve([]);
    }
  }
}

interface AutocompleteResult {
  name: string;
  value: string;
}
