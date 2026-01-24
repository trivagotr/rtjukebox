declare module 'react-native-rss-parser' {
  export interface RSSItem {
    id: string;
    title: string;
    description: string;
    content: string;
    cleanDescription?: string; // Optional as it might be computed
    links: {url: string; rel: string}[];
    authors: {name: string}[];
    published: string;
    enclosures: {url: string; length?: string; mimeType?: string}[];
    itunes: {
      image?: string;
      duration?: string;
      explicit?: string;
      keywords?: string[];
      subtitle?: string;
      summary?: string;
    };
  }

  export interface RSSChannel {
    title: string;
    description: string;
    links: {url: string; rel: string}[];
    items: RSSItem[];
    image: {
      url: string;
      title: string;
    };
    itunes: {
      image?: string;
      categories?: {name: string; subCategories?: {name: string}[]}[];
    };
  }

  export function parse(feedUrl: string): Promise<RSSChannel>;
}
