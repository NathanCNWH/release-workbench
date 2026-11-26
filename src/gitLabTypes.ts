export interface GitLabMember {
  id: number;
  username: string;
  name: string;
}

export interface GitLabRepository {
  repositoryKey: string;
  repository: string;
  services: string[];
  apiAddress: string;
  defaultApiAddress: string;
  targetBranch: string;
  defaultAssignee: GitLabMember | null;
}

export interface GitLabMergeRequest {
  iid: number;
  url: string;
  targetBranch: string;
  assignee: GitLabMember | null;
}

export type GitLabPreviewRow = GitLabRepository & ({
  gitLabProjectId: number;
  members: GitLabMember[];
  existing: GitLabMergeRequest[];
  error?: never;
} | {
  error: string;
  gitLabProjectId?: never;
  members?: never;
  existing?: never;
});

export interface GitLabPreview {
  sourceBranch: string;
  rows: GitLabPreviewRow[];
}

export interface GitLabResult {
  repositoryKey: string;
  repository: string;
  targetBranch: string;
  status: "created" | "assigned" | "reused" | "pending" | "failed";
  mr?: GitLabMergeRequest;
  message?: string;
}

export const memberLabel = (member: GitLabMember) =>
  member.name === member.username ? "@" + member.username : member.name + " (@" + member.username + ")";
