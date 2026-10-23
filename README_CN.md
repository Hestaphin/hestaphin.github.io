# COPKU v1.24 更新

已完成本次 Supabase 数据库及账号函数更新，无需重复手动设置。上传网站文件后即可使用个人主页、人员资料管理、未读角标、回复通知、10MB 附件及账号激活。请先阅读 `UPDATE_FROM_v1.23.md` 和 `MEMBER_FIELDS_v1.24.md`；下方是历史版本说明。

# COPKU v1.23 更新

完整网站上传步骤请先阅读 `UPDATE_FROM_v1.22.md`。已连接的 Supabase 数据库更新、审批修复和 Stripe 商店设置记录在 `SUPABASE_SETUP_v1.23.md`、`SHOP_STRIPE_SETUP_v1.23.md`；无需重做旧版基础设置。下面保留 v1.19 的历史说明。

# COPKU v1.19：免费基础会员及两套独立账号

Club 可以免费注册 **Membership Basic**。升级和付款已经移到 Club 会员后台。

Orchestra 和 Club 使用不同的 Supabase 项目、账号、密码、会话及后台。同一个邮箱可以分别注册两套账号，密码可以不同；退出或修改 Club 密码不会影响 Orchestra。

本次已经修改并检查网站代码，但**尚未替你在 Supabase 执行 SQL、创建项目、部署函数或修改 Stripe**。Club 新项目的公开配置现在留空，所以配置完成前不会把 Club 用户误写入乐团系统。

## 免费注册：先完成这些步骤

1. 保留原有 Orchestra 项目，另外新建一个 Supabase 项目，例如 `COPKU Club`。
2. 在**新 Club 项目**的 SQL Editor 中执行 `supabase/club/migrations/202610200001_club_basic.sql`。不要在原有乐团项目运行这份脚本。
3. 在 Club 的 Authentication 设置中开启 Email/Password、允许新用户注册，密码最少 8 位，保留邮箱验证；配置自定义 SMTP，才能给普通访客发送验证邮件。
4. Authentication → URL Configuration 的 Site URL 填网站根地址。Redirect URLs 添加以下三个地址；如果使用其他域名，一并替换：

   ```text
   https://copku-homepage-october-2026.neonlake16.chatgpt.site/portal/membership/
   https://copku-homepage-october-2026.neonlake16.chatgpt.site/portal/membership/?welcome=1
   https://copku-homepage-october-2026.neonlake16.chatgpt.site/portal/membership/?set_password=1
   ```

5. 把 Club 项目的 Project URL 和 publishable key（或公开 anon key）填入网站 `config.js` 的两个新字段，再重新部署网站：

   ```js
   window.COPKU_CLUB_SUPABASE_URL = 'https://你的Club项目.supabase.co';
   window.COPKU_CLUB_SUPABASE_PUBLISHABLE_KEY = '你的Club公开密钥';
   ```

原有 `PUCO_SUPABASE_URL`、`PUCO_SUPABASE_ANON_KEY` 继续供 Orchestra 使用，保持不变。不要在网页中填写 service-role、secret key、Stripe 密钥或数据库密码。乐团项目不需要开放公众注册。

Club 注册入口是 `/opportunities/club/#club-registration-form`；登录选择 Club，后台地址是 `/portal/membership/`。Orchestra 后台仍是 `/portal/internal/`。基础会员无需付款，付费过期后仍可使用基础会员后台。

## 会员升级和付款

在 Club 项目配置三个原有付费档位：Standard CNY 199、Supporter CNY 399、Patron CNY 999，各为 12 个月、一次性付款。基础会员不在付费计划表中。

新建的付费计划默认没有启用。完成 Stripe Price ID 和密钥配置后再启用。

在 **Club Supabase 后台 → Edge Functions → Deploy a new function → Via Editor** 创建两个函数。将对应文件完整复制到编辑器的 `index.ts` 后部署，不需要 Supabase CLI：

| 函数名称 | 文件 |
| --- | --- |
| `create-club-checkout` | `supabase/club/functions/create-club-checkout/index.ts` |
| `club-stripe-webhook` | `supabase/club/functions/club-stripe-webhook/index.ts` |

给 Club 项目的 Edge Functions 配置 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SIGNING_SECRET`、`SITE_URL`。checkout 保留 JWT 验证；**仅 webhook 关闭 JWT 验证**，由代码验证 Stripe 签名。

Stripe webhook 地址为 `https://你的Club项目.supabase.co/functions/v1/club-stripe-webhook`，监听 completed、async_payment_succeeded、async_payment_failed、expired 四个 checkout.session 事件。所有价格、测试/正式密钥及签名密钥必须配套。

具体操作、SQL 更新价格示例、四个完整事件名和检查步骤见 **`supabase/club/SETUP.md`**。网页里的支付成功返回参数不能升级会员；必须经过服务器验证 Stripe 付款，再原子写入订单和会员状态。同一付款重复通知不会重复延长时间。

续费相同有效档位会延长原到期时间；升级更高档位从付款时重新计算，剩余时间不折抵，不自动续费。退款和拒付需要管理员审核并调整权益。

## 已有 Club 账号

旧项目中的 Club 账号不会自动成为新项目账号，也不会被删除或修改。若已有付费会员，先导出旧 `role = member` 的记录和订单，让会员在新项目用同邮箱注册或重新邀请，再在新 Club 项目恢复已核实的付费档位与到期日。不要复制乐团 admin/internal 账号或密码。旧激活邮件要从新项目重新发送。

旧付款仍在处理时先完成对账，再停用旧 membership checkout 和旧 Stripe webhook。新后台记录新 Club 付款，历史订单保留为旧系统档案。详细迁移说明在 `supabase/club/SETUP.md` 第 5 部分。

网站发布权限仍保持原来的仅所有者可访问；准备开放公众注册时，再单独调整网站访问权限。

本次检查包含实际前端与函数代码的模拟认证/支付，以及嵌入式 PostgreSQL 中的触发器、权限、RLS、升级事务和重复通知检查。没有发送真实邮件、创建真实账号或进行真实扣款；浏览器视觉检查尚未进行。
