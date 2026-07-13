import { createAnonClient } from "./supabase/server";
import type { CurrentMetric, MetricSnapshot, Post } from "./supabase/types";

export async function getCurrentMetrics(
  filters: { q?: string; topic?: string; postType?: string } = {}
): Promise<CurrentMetric[]> {
  const supabase = createAnonClient();
  let query = supabase.from("current_metrics").select("*");
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);
  if (filters.topic) query = query.eq("topic", filters.topic);
  if (filters.postType) query = query.eq("post_type", filters.postType);

  const { data, error } = await query.order("snapshot_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CurrentMetric[];
}

export async function getFilterOptions(): Promise<{ topics: string[]; postTypes: string[] }> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("posts").select("topic, post_type");
  if (error) throw new Error(error.message);

  const topics = new Set<string>();
  const postTypes = new Set<string>();
  for (const row of data ?? []) {
    if (row.topic) topics.add(row.topic);
    if (row.post_type) postTypes.add(row.post_type);
  }
  return { topics: Array.from(topics).sort(), postTypes: Array.from(postTypes).sort() };
}

export async function getLeaderboards(): Promise<{
  bySubscribers: CurrentMetric[];
  byViews: CurrentMetric[];
  byEngagement: CurrentMetric[];
}> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("current_metrics").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CurrentMetric[];

  const top = (key: keyof CurrentMetric) =>
    [...rows]
      .filter((r) => r[key] != null)
      .sort((a, b) => (b[key] as number) - (a[key] as number))
      .slice(0, 10);

  return {
    bySubscribers: top("new_subscribers"),
    byViews: top("views"),
    byEngagement: top("engagement"),
  };
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("posts").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Post | null;
}

export async function getSnapshotsForPost(postId: string): Promise<MetricSnapshot[]> {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("metric_snapshots")
    .select("*")
    .eq("post_id", postId)
    .order("snapshot_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MetricSnapshot[];
}
