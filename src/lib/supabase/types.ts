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

// Fila de post_categories: una categoría de post, gestionable desde /subir
// (ver lib/categories.ts). Reemplaza a la lista fija que había en código.
export type PostCategory = {
  id: string;
  name: string;
  slug: string;
  color: string;
  shape: string;
  sort_order: number;
  created_at: string;
};

export type Subscriber = {
  id: string;
  email: string;
  name: string | null;
  type: string | null;
  stripe_plan: string | null;
  start_date: string | null;
  cancel_date: string | null;
  paid_upgrade_date: string | null;
  first_paid_date: string | null;
  expiration_date: string | null;
  subscription_source_free: string | null;
  subscription_source_paid: string | null;
  country: string | null;
  state_province: string | null;
  sections: string[] | null;
  created_at: string;
  updated_at: string;
};

export type SubscriberSnapshot = {
  id: string;
  subscriber_id: string;
  snapshot_date: string;
  revenue: number | null;
  subscriptions_gifted: number | null;
  bestseller: number | null;
  emails_received_6mo: number | null;
  emails_dropped_6mo: number | null;
  emails_opened_6mo: number | null;
  emails_opened_7d: number | null;
  emails_opened_30d: number | null;
  num_emails_opened: number | null;
  last_email_open: string | null;
  links_clicked: number | null;
  last_clicked_at: string | null;
  unique_emails_seen_6mo: number | null;
  unique_emails_seen_7d: number | null;
  unique_emails_seen_30d: number | null;
  post_views: number | null;
  post_views_7d: number | null;
  post_views_30d: number | null;
  unique_posts_seen: number | null;
  unique_posts_seen_7d: number | null;
  unique_posts_seen_30d: number | null;
  comments: number | null;
  comments_7d: number | null;
  comments_30d: number | null;
  shares: number | null;
  shares_7d: number | null;
  shares_30d: number | null;
  days_active_30d: number | null;
  activity: number | null;
  created_at: string;
};

// Fila de la vista `current_subscriber_metrics`: el snapshot más reciente de
// cada suscriptor, con open_rate_6mo/click_rate ya calculados en el SQL.
export type CurrentSubscriberMetric = Subscriber & {
  subscriber_id: string;
  snapshot_date: string;
  revenue: number | null;
  subscriptions_gifted: number | null;
  bestseller: number | null;
  emails_received_6mo: number | null;
  emails_dropped_6mo: number | null;
  emails_opened_6mo: number | null;
  emails_opened_7d: number | null;
  emails_opened_30d: number | null;
  num_emails_opened: number | null;
  last_email_open: string | null;
  links_clicked: number | null;
  last_clicked_at: string | null;
  unique_emails_seen_6mo: number | null;
  unique_emails_seen_7d: number | null;
  unique_emails_seen_30d: number | null;
  post_views: number | null;
  post_views_7d: number | null;
  post_views_30d: number | null;
  unique_posts_seen: number | null;
  unique_posts_seen_7d: number | null;
  unique_posts_seen_30d: number | null;
  comments: number | null;
  comments_7d: number | null;
  comments_30d: number | null;
  shares: number | null;
  shares_7d: number | null;
  shares_30d: number | null;
  days_active_30d: number | null;
  activity: number | null;
  open_rate_6mo: number | null;
  click_rate: number | null;
};
