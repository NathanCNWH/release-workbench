export type Page =
  | "overview"
  | "projects"
  | "versions"
  | "environments"
  | "deployments"
  | "backups"
  | "ai";
export type ReleaseStatus = "草稿" | "就绪" | "已归档";
export interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  color: string;
  updated: string;
}
export interface Component {
  id: string;
  name: string;
  repository: string;
  branch: string;
  commit: string;
  artifact: string;
  kind: string;
}
export interface SqlScript {
  id: string;
  name: string;
  database: string;
  order: number;
  kind: "新增" | "修改" | "沿用";
  description: string;
  sql: string;
  previousSql: string;
}
export interface ConfigFile {
  id: string;
  name: string;
  path: string;
  format: string;
  content: string;
  previousContent: string;
}
export interface Release {
  id: string;
  projectId: string;
  name: string;
  title: string;
  status: ReleaseStatus;
  created: string;
  author: string;
  scripts: SqlScript[];
  configs: ConfigFile[];
  components: Component[];
}
export interface Environment {
  id: string;
  projectId: string;
  name: string;
  key: string;
  type: string;
  host: string;
  port: string;
  username: string;
  deployPath: string;
  backupPath: string;
  dbHost: string;
  dbPort: string;
  database: string;
  dbUser: string;
  jenkinsUrl: string;
  jenkinsUser: string;
  job: string;
  configPath: string;
  currentVersion: string;
  checkedAt: string;
}
export interface DeployStep {
  name: string;
  detail: string;
  state: "成功" | "失败" | "未执行";
}
export interface Deployment {
  id: string;
  projectId: string;
  versionId: string;
  environmentId: string;
  status: "成功" | "失败";
  started: string;
  duration: string;
  actor: string;
  steps: DeployStep[];
}
export interface Backup {
  id: string;
  projectId: string;
  environmentId: string;
  name: string;
  type: string;
  version: string;
  size: string;
  created: string;
  location: string;
  status: string;
}
