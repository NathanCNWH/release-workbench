export type Page =
  | "overview"
  | "projects"
  | "services"
  | "jenkins"
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
  services: Service[];
}
export interface Service {
  id: string;
  name: string;
  repository: string;
  defaultBranch: string;
  kind: "后端服务" | "前端应用";
}
export interface JenkinsProfile {
  id: "frontend" | "backend";
  name: string;
  url: string;
  username: string;
  credentialConfigured: boolean;
}
export interface ServerConnection {
  id: string;
  name: string;
  host: string;
  port: string;
  username: string;
  authentication: "password" | "environment" | "key";
  credentialConfigured?: boolean;
}
export interface JobBinding {
  serviceId: string;
  serverIds?: string[];
  job: string;
  parameters: string;
  supportsBranch: boolean;
  branchParameter: string;
  branches: string[];
  defaultBranch: string;
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
  servers: ServerConnection[];
  bindings: JobBinding[];
  deployPath: string;
  backupPath: string;
  dbHost: string;
  dbPort: string;
  database: string;
  dbUser: string;
  configPath: string;
  checkedAt: string;
  dbCredentialConfigured?: boolean;
}
export interface ServiceBuild {
  serviceId: string;
  name: string;
  job: string;
  jenkinsName: string;
  jenkinsUrl: string;
  branch: string;
  branchParameter: string;
  parameters: string;
  status: BuildStatus;
  buildNumber: number;
  consoleUrl: string;
  log: string;
  repository?: string;
  servers?: ServerConnection[];
  kind?: string;
  buildUrl?: string;
  queueUrl?: string;
  lastError?: string;
  jenkinsResult?: string;
}
export type BuildStatus =
  | "待提交"
  | "提交中"
  | "排队中"
  | "构建中"
  | "成功"
  | "失败"
  | "部分失败"
  | "已中止"
  | "结果未知";
export interface DeployStep {
  name: string;
  detail: string;
  state: "成功" | "失败" | "未执行";
}
export interface Deployment {
  id: string;
  projectId: string;
  environmentId: string;
  status: BuildStatus;
  started: string;
  duration: string;
  actor: string;
  steps: DeployStep[];
  services: ServiceBuild[];
  versionId?: string | null;
  versionIds?: string[];
  versionSnapshot?: VersionMerge;
  deployPath?: string;
  versionName?: string;
  environmentName?: string;
}
export interface Origin {
  versionId: string;
  versionName: string;
  resourceId: string;
}
export interface VersionMerge {
  versions: Release[];
  scripts: (SqlScript & { origins: Origin[] })[];
  configs: (ConfigFile & { origins: Origin[]; resolvedPath?: string })[];
  conflicts: {
    key: string;
    kind: "sql" | "config";
    label: string;
    selectedId: string;
    choices: {
      id: string;
      origins: Origin[];
      item: Partial<SqlScript & ConfigFile>;
    }[];
  }[];
  resolutions: Record<string, string>;
  unresolved: number;
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
  error?: string;
  sha256?: string;
}
