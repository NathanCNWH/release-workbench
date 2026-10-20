import type {
  Project,
  Release,
  Environment,
  Deployment,
  Backup,
  DeployStep,
  JenkinsProfile,
  ServiceBuild,
} from "./types";

export const projects: Project[] = [
  {
    id: "order",
    name: "订单管理系统",
    key: "order-platform",
    description: "订单服务、管理控制台及配套数据库的统一发布管理。",
    color: "green",
    updated: "今天 14:32",
    services: [
      {
        id: "api",
        name: "order-api",
        kind: "后端服务",
        repository: "git.example.com/team/order-api.git",
        defaultBranch: "test",
      },
      {
        id: "web",
        name: "order-console",
        kind: "前端应用",
        repository: "git.example.com/team/order-console.git",
        defaultBranch: "main",
      },
      {
        id: "worker",
        name: "order-worker",
        kind: "后端服务",
        repository: "git.example.com/team/order-worker.git",
        defaultBranch: "main",
      },
    ],
  },
  {
    id: "portal",
    name: "客户服务门户",
    key: "customer-portal",
    description: "客户门户与开放接口，管理前后端和环境配置。",
    color: "blue",
    updated: "昨天 17:20",
    services: [
      {
        id: "portal-web",
        name: "portal-web",
        kind: "前端应用",
        repository: "git.example.com/team/portal.git",
        defaultBranch: "main",
      },
    ],
  },
  {
    id: "data",
    name: "数据交换服务",
    key: "data-exchange",
    description: "数据接入与交换服务的版本、脚本及部署记录。",
    color: "orange",
    updated: "10 月 18 日",
    services: [
      {
        id: "exchange-api",
        name: "exchange-api",
        kind: "后端服务",
        repository: "git.example.com/team/exchange.git",
        defaultBranch: "test",
      },
    ],
  },
];

const components = [
  {
    id: "api",
    name: "order-api",
    repository: "git.example.com/team/order-api.git",
    branch: "release/20261020",
    commit: "c71b3e8",
    artifact: "order-api-20261020-02.jar",
    kind: "后端服务",
  },
  {
    id: "web",
    name: "order-console",
    repository: "git.example.com/team/order-console.git",
    branch: "release/20261020",
    commit: "8a4f20c",
    artifact: "order-console-20261020-02.zip",
    kind: "前端应用",
  },
];

export const releases: Release[] = [
  {
    id: "r3",
    projectId: "order",
    name: "20261020-02",
    title: "订单状态流转优化与导出能力更新",
    status: "草稿",
    created: "2026-10-20 14:32",
    author: "本地用户",
    components,
    scripts: [
      {
        id: "s1",
        name: "001_add_order_source.sql",
        database: "order_db",
        order: 1,
        kind: "新增",
        description: "新增订单来源字段，用于区分各业务渠道。",
        previousSql: "",
        sql: "-- 订单来源字段\n-- 适用数据库：order_db\n\nALTER TABLE `orders`\n  ADD COLUMN `source` varchar(32)\n  NOT NULL DEFAULT 'web'\n  COMMENT '订单来源' AFTER `status`;\n\n-- 为历史订单补充来源\nUPDATE `orders`\nSET `source` = 'web'\nWHERE `source` = '';\n\n-- 核验字段\nSHOW COLUMNS FROM `orders` LIKE 'source';",
      },
      {
        id: "s2",
        name: "002_update_order_index.sql",
        database: "order_db",
        order: 2,
        kind: "修改",
        description: "复合索引增加订单状态，优化订单列表筛选。",
        previousSql:
          "-- 订单列表查询索引\nCREATE INDEX `idx_order_user`\nON `orders` (`user_id`, `created_at`);",
        sql: "-- 优化订单列表查询索引\nDROP INDEX `idx_order_user` ON `orders`;\n\nCREATE INDEX `idx_order_user_status`\nON `orders` (`user_id`, `status`, `created_at`);\n\nSHOW INDEX FROM `orders`;",
      },
      {
        id: "s3",
        name: "003_add_export_permission.sql",
        database: "order_db",
        order: 3,
        kind: "新增",
        description: "增加订单导出权限项。",
        previousSql: "",
        sql: "-- 订单导出权限\nINSERT INTO `permissions`\n  (`code`, `name`, `module`)\nVALUES\n  ('order:export', '导出订单', 'order');\n\nSELECT `code`, `name`\nFROM `permissions`\nWHERE `code` = 'order:export';",
      },
    ],
    configs: [
      {
        id: "c1",
        name: "application-prod.yml",
        path: "${CONFIG_PATH}/application.yml",
        format: "YAML",
        previousContent:
          "server:\n  port: 8080\n\norder:\n  export:\n    enabled: false\n    max-rows: 1000",
        content:
          "server:\n  port: 8080\n\nspring:\n  datasource:\n    url: ${DB_URL}\n    username: ${DB_USER}\n    password: ${DB_PASSWORD}\n\norder:\n  export:\n    enabled: true\n    max-rows: 10000",
      },
      {
        id: "c2",
        name: "nginx.conf",
        path: "${CONFIG_PATH}/nginx.conf",
        format: "文本",
        previousContent:
          "location /api/ {\n    proxy_pass http://127.0.0.1:8080/;\n}",
        content:
          "location /api/ {\n    proxy_pass http://127.0.0.1:8080/;\n    proxy_read_timeout 120s;\n    client_max_body_size 20m;\n}",
      },
    ],
  },
  {
    id: "r2",
    projectId: "order",
    name: "20261019-01",
    title: "订单查询性能优化",
    status: "就绪",
    created: "2026-10-19 16:20",
    author: "本地用户",
    scripts: [],
    configs: [],
    components: components.map((c) => ({
      ...c,
      branch: "release/20261019",
      commit: c.id === "api" ? "0b62e1a" : "73a9c10",
      artifact: c.artifact.replace("20261020-02", "20261019-01"),
    })),
  },
  {
    id: "r1",
    projectId: "order",
    name: "20261018-01",
    title: "基础能力与首个环境发布",
    status: "已归档",
    created: "2026-10-18 10:15",
    author: "本地用户",
    scripts: [],
    configs: [],
    components,
  },
  {
    id: "p1",
    projectId: "portal",
    name: "20261019-01",
    title: "客户资料页面与接口更新",
    status: "就绪",
    created: "2026-10-19 17:20",
    author: "本地用户",
    scripts: [],
    configs: [],
    components: [],
  },
  {
    id: "d1",
    projectId: "data",
    name: "20261018-01",
    title: "交换任务初始版本",
    status: "草稿",
    created: "2026-10-18 11:00",
    author: "本地用户",
    scripts: [],
    configs: [],
    components: [],
  },
];

export const jenkinsProfiles: JenkinsProfile[] = [
  {
    id: "frontend",
    name: "前端 Jenkins",
    url: "https://jenkins-frontend.example.com",
    username: "frontend-bot",
    credentialConfigured: true,
  },
  {
    id: "backend",
    name: "后端 Jenkins",
    url: "https://jenkins-backend.example.com",
    username: "backend-bot",
    credentialConfigured: true,
  },
];

export const environments: Environment[] = [
  {
    id: "test",
    projectId: "order",
    name: "测试环境",
    key: "test",
    type: "测试",
    servers: [
      {
        id: "test-1",
        name: "应用节点 1",
        host: "192.0.2.10",
        port: "22",
        username: "deployer",
        authentication: "password",
      },
      {
        id: "test-2",
        name: "应用节点 2",
        host: "192.0.2.12",
        port: "22",
        username: "deployer",
        authentication: "password",
      },
    ],
    bindings: [
      {
        serviceId: "api",
        job: "order/order-api-test",
        parameters: "ENVIRONMENT=test",
        supportsBranch: true,
        branchParameter: "BRANCH",
        branches: ["test", "test_zy", "main", "release/20261020"],
        defaultBranch: "test",
      },
      {
        serviceId: "web",
        job: "order/order-console-test",
        parameters: "ENVIRONMENT=test",
        supportsBranch: false,
        branchParameter: "BRANCH",
        branches: ["test", "test_zy", "main", "release/20261020"],
        defaultBranch: "test",
      },
    ],
    deployPath: "/opt/apps/order",
    backupPath: "/opt/backups/order",
    dbHost: "192.0.2.11",
    dbPort: "3306",
    database: "order_db_test",
    dbUser: "order_user",
    configPath: "/opt/apps/order/config",
    checkedAt: "资料已维护（未连接）",
  },
  {
    id: "prod",
    projectId: "order",
    name: "生产环境",
    key: "prod",
    type: "生产",
    servers: [
      {
        id: "prod-1",
        name: "应用节点 1",
        host: "192.0.2.20",
        port: "22",
        username: "deployer",
        authentication: "password",
      },
      {
        id: "prod-2",
        name: "应用节点 2",
        host: "192.0.2.22",
        port: "22",
        username: "deployer",
        authentication: "password",
      },
    ],
    bindings: [
      {
        serviceId: "api",
        job: "order/order-api-prod",
        parameters: "ENVIRONMENT=prod",
        supportsBranch: true,
        branchParameter: "BRANCH",
        branches: ["test", "test_zy", "main", "release/20261020"],
        defaultBranch: "main",
      },
      {
        serviceId: "web",
        job: "order/order-console-prod",
        parameters: "ENVIRONMENT=prod",
        supportsBranch: false,
        branchParameter: "BRANCH",
        branches: ["test", "test_zy", "main", "release/20261020"],
        defaultBranch: "main",
      },
    ],
    deployPath: "/opt/apps/order",
    backupPath: "/opt/backups/order",
    dbHost: "192.0.2.21",
    dbPort: "3306",
    database: "order_db",
    dbUser: "order_user",
    configPath: "/opt/apps/order/config",
    checkedAt: "资料已维护（未连接）",
  },
  {
    id: "portal-test",
    projectId: "portal",
    name: "测试环境",
    key: "test",
    type: "测试",
    servers: [
      {
        id: "portal-test-1",
        name: "应用节点 1",
        host: "192.0.2.30",
        port: "22",
        username: "deployer",
        authentication: "password",
      },
    ],
    bindings: [
      {
        serviceId: "portal-web",
        job: "portal/portal-web-test",
        parameters: "ENVIRONMENT=test",
        supportsBranch: true,
        branchParameter: "BRANCH",
        branches: ["test", "test_zy", "main", "release/20261020"],
        defaultBranch: "test",
      },
    ],
    deployPath: "/opt/apps/portal",
    backupPath: "/opt/backups/portal",
    dbHost: "192.0.2.31",
    dbPort: "3306",
    database: "portal_db_test",
    dbUser: "portal_user",
    configPath: "/opt/apps/portal/config",
    checkedAt: "资料已维护（未连接）",
  },
];

export const planSteps: DeployStep[] = [
  {
    name: "选择环境和服务",
    detail: "读取已绑定的 Jenkins Job 与固定参数",
    state: "成功",
  },
  {
    name: "确认分支与参数",
    detail: "只有支持分支参数的 Job 才传入所选分支",
    state: "成功",
  },
  {
    name: "触发 Jenkins Job",
    detail: "按服务类型使用全局前端或后端账号，记录队列号",
    state: "成功",
  },
  {
    name: "等待构建并记录结果",
    detail: "获取构建编号、最终结果和控制台日志地址",
    state: "成功",
  },
];

function sampleBuild(
  serviceId: string,
  env: string,
  failed = false,
): ServiceBuild {
  const frontend = serviceId === "web";
  const name = frontend ? "order-console" : "order-api";
  const job = `order/${name}-${env}`;
  const jenkinsUrl = frontend ? jenkinsProfiles[0].url : jenkinsProfiles[1].url;
  return {
    serviceId,
    name,
    job,
    jenkinsName: frontend ? "前端 Jenkins" : "后端 Jenkins",
    jenkinsUrl,
    branch: frontend ? "" : env === "test" ? "test" : "main",
    branchParameter: frontend ? "" : "BRANCH",
    parameters: `ENVIRONMENT=${env}`,
    status: failed ? "失败" : "成功",
    buildNumber: failed ? 164 : 163,
    consoleUrl: `${jenkinsUrl}/job/order/job/${name}-${env}/${failed ? 164 : 163}/console`,
    log: `[示例构建日志，未连接 Jenkins]\nJob: ${job}\n构建开始，等待 Jenkins 返回结果...\n${failed ? "Finished: FAILURE\n示例原因：构建步骤返回非零退出码。请查看 Job 控制台。" : "Finished: SUCCESS\n结果来自示例数据，实际发布行为由 Job 决定。"}`,
  };
}

export const deployments: Deployment[] = [
  {
    id: "DEP-0008",
    projectId: "order",
    environmentId: "prod",
    status: "部分失败",
    started: "2026-10-20 13:42",
    duration: "1 分 28 秒",
    actor: "本地用户",
    services: [sampleBuild("api", "prod", true), sampleBuild("web", "prod")],
    steps: [],
  },
  {
    id: "DEP-0007",
    projectId: "order",
    environmentId: "test",
    status: "成功",
    started: "2026-10-19 16:30",
    duration: "2 分 14 秒",
    actor: "本地用户",
    services: [sampleBuild("api", "test"), sampleBuild("web", "test")],
    steps: [],
  },
  {
    id: "DEP-0006",
    projectId: "order",
    environmentId: "prod",
    status: "成功",
    started: "2026-10-18 11:08",
    duration: "2 分 42 秒",
    actor: "本地用户",
    services: [sampleBuild("api", "prod")],
    steps: [],
  },
];

export const backups: Backup[] = [
  {
    id: "BKP-0012",
    projectId: "order",
    environmentId: "prod",
    name: "order_db_20261020_1342.sql.gz",
    type: "MySQL",
    version: "20261019-01",
    size: "128.4 MB",
    created: "2026-10-20 13:42",
    location: "D:/ReleaseWorkbench/data/backups/order/prod/",
    status: "备份完成",
  },
  {
    id: "BKP-0011",
    projectId: "order",
    environmentId: "prod",
    name: "config_20261020_1342.tar.gz",
    type: "配置文件",
    version: "20261019-01",
    size: "24.8 KB",
    created: "2026-10-20 13:42",
    location: "D:/ReleaseWorkbench/data/backups/order/prod/",
    status: "备份完成",
  },
  {
    id: "BKP-0010",
    projectId: "order",
    environmentId: "test",
    name: "order_db_test_20261019_1630.sql.gz",
    type: "MySQL",
    version: "20261019-01",
    size: "42.6 MB",
    created: "2026-10-19 16:30",
    location: "D:/ReleaseWorkbench/data/backups/order/test/",
    status: "备份完成",
  },
];

export function nextVersion(all: Release[], projectId: string) {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" })
    .format(new Date())
    .replaceAll("-", "");
  const suffixes = all
    .filter((v) => v.projectId === projectId && v.name.startsWith(day + "-"))
    .map((v) => Number(v.name.slice(day.length + 1)))
    .filter(Number.isFinite);
  return `${day}-${String(Math.max(0, ...suffixes) + 1).padStart(2, "0")}`;
}
