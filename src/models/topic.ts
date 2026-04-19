export type TopicStatus = "pending" | "approved" | "rejected";

export interface Topic {
  id: string;
  title: string;
  description: string;
  status: TopicStatus;
  createdAt: string;
  approvedAt: string | null;
}
