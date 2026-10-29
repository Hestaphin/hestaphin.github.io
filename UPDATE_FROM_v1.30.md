# COPKU v1.31 — 2026-10-25

## 本次改动

管理员的 **Settings → Application → Orchestra applications** 已删除发件邮箱、发件人名称、Brevo API 密钥输入框，以及“验证并保存发件人”操作。页面现在只显示只读的邮件配置状态。具体申请仍可查看确认邮件是否等待发送、已发送、失败或投递状态未确认，并保留带提示的重试操作。

发送服务只读取 Orchestra Supabase 项目的 Edge Function Secrets。旧版个人中心保存的发件设置不再覆盖这些值；旧版页面尝试保存时会提示改用 Supabase 和 Brevo。密钥不会返回网页。原来的报名表、紧急必做审核任务、预约和其他功能保留。

## 只在 Supabase 和 Brevo 设置

1. 在 Brevo 打开 **Settings → Senders, Domains, IPs → Senders**，添加或确认你有权使用的发件邮箱，并完成发件人／域名验证。
2. 打开 Brevo 的 **Settings → SMTP & API → API Keys & MCP**，生成普通 API 密钥，例如命名为 `COPKU application receipts`。不要开启 MCP server API key；这里也不使用 SMTP 密钥。
3. 打开 Orchestra 项目 **COPKU DATA**：<https://supabase.com/dashboard/project/mqthckhoxtqtyuhtdunl>。
4. 进入 **Edge Functions → Secrets**，添加以下三项并保存：

| Key | Value |
| --- | --- |
| `BREVO_API_KEY` | 第 2 步生成的 Brevo API 密钥 |
| `APPLICATION_FROM_EMAIL` | 第 1 步已验证的发件邮箱 |
| `APPLICATION_FROM_NAME` | `北京未名室内管弦乐团`，或你希望显示的发件人名称 |

请在服务商页面私下输入密钥，不要写入网站文件。只有确实已验证 `admin@pkuco.org` 时，才把它用作发件邮箱；Brevo 的 SMTP 登录用户名不是发件邮箱。

这三项若已经保存，无须重新添加。保存新 Secrets 后，当前函数会自动读取，不需要使用 CLI、不需要重新部署、不需要生成随机值。已安装的队列每分钟处理一次；等待中的确认邮件会在配置有效后自动处理。不要修改现有 **Authentication → SMTP**：它用于注册、验证和找回密码邮件。

你可以自行用自己的邮箱提交一份申请，稍等约一分钟，再检查邮件和该申请的投递状态。配置状态仅表示服务器已取得必要设置；是否成功投递以每份申请的状态为准。

## 网站更新与安装记录

上传 `COPKU_Website_v1.31` 文件夹内的完整内容来更新正式网站。完整包保留 v1.19 的所有原始路径及图片。当前已连接 Supabase 的 `portal-admin`、`application-mail-worker`、`submit-orchestra-application` 已更新；此次无新增数据库设置步骤，也不需要重新执行旧 SQL。

如果重建到另一个项目，需使用包内对应函数文件及它们的 `.mjs` 依赖。旧的数据库安装脚本保留作历史与重建用途；其中旧发件配置 RPC 已无网页入口，也不再被发送服务使用。`12_optional_pg_net_schema_repair_v130.sql` 仍是未执行的可选维护，不属于本次安装。

本次自动化检查覆盖：外部配置读取、缺少发件邮箱时不发送、旧保存请求被拒绝、状态接口不返回凭据、申请审核及邮件排队行为。未主动发送真实测试邮件。浏览器预览基础服务当前不可用，未完成浏览器视觉检查。

参考：[Supabase Secrets](https://supabase.com/docs/guides/functions/secrets)、[Brevo 发件人](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)、[Brevo API 密钥](https://help.brevo.com/hc/en-us/articles/209467485-Create-and-manage-your-API-keys)。
