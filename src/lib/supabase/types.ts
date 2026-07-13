export type Post = {
  id: string;
  slug: string;
  url: string | null;
  title: string;
  author: string | null;
  published_at: string | null;
  topic: string | null;
  post_type: string | null;
  created_at: string;
  updated_at: string;
};

export type MetricSnapshot = {
  id: string;
  post_id: string;
  snapshot_date: string;
  views: number | null;
  new_subscribers: number | null;
  open_rate: number | null;
  click_to_open_rate: number | null;
  engagement: number | null;
  created_at: string;
};

// Fila de la vista `current_metrics`: el snapshot más reciente de cada post.
export type CurrentMetric = {
  post_id: string;
  slug: string;
  url: string | null;
  title: string;
  author: string | null;
  published_at: string | null;
  topic: string | null;
  post_type: string | null;
  snapshot_date: string;
  views: number | null;
  new_subscribers: number | null;
  open_rate: number | null;
  click_to_open_rate: number | null;
  engagement: number | null;
};
