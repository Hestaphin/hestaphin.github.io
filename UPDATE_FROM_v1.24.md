# COPKU v1.25 — website update

The connected COPKU DATA database, refund functions and Stripe shop webhook have already been updated. You do not need to repeat Supabase setup or enter a new key.

1. Download and unzip `COPKU_Website_v1.25.zip`.
2. Publish the files **inside** `COPKU_Website_v1.25` to your existing website, replacing matching files and including the new `language.js`. Keep the existing folder paths. This is a complete website, not a patch.
3. Refresh the website. If an older layout is cached, perform a hard refresh.

The private Sites preview is also updated. Its `/portal-preview/` page uses sample accounts and sample orders; refund actions there are demonstrations and do not contact Stripe. Use `/portal/internal/` on your published website for real account data and real refunds.

## Changes

- Settings → Accounts uses a compact member table. Click a value to change it; related department/occupation/instrument or classification/rank choices are saved together. Email edits made by admins still take effect without verification. The delete action now reads **Delete**.
- Settings → Club approvals and Shop orders, and Manage chat requests, use tables.
- Contact search sits above the names and filters by name, username, email, department or instrument. Searching does not discard the current message draft.
- Background color → Image transparency adjusts only the custom image. Text stays opaque. Your chosen transparency is remembered in this browser.
- **EN / CN** beside Login changes the shared navigation, public page copy and portal interface. The choice persists across pages. Names, emails, form values and authored messages keep their original text.
- Settings → Shop orders → Refund / History retrieves Stripe history and permits a full remaining or partial refund. Enter an amount, select a reason, then use **Confirm refund**. This sends an actual refund to the original payment method.

Refunds issued in the Stripe Dashboard also synchronize to the order table. Pending and failed refunds are shown separately from successful refunded totals. A refund does not erase the payment or delivery record. A pending/full refund or unresolved refund request blocks marking the order delivered. If a network error leaves a request uncertain, reopen its refund history and retry that same request; do not create another refund in Stripe. Requests unresolved beyond 23 hours require review in Stripe.

## 已完成的设置

本次 Supabase 数据库、退款函数及 Stripe 商店 webhook 已配置完成，无需重复手动设置。把完整 v1.25 网站文件上传到原网站即可。`language.js` 是新增文件，需要一并上传。

管理员在“设置 → 商店订单 → 退款 / 记录”中查看记录、填写全额或部分退款金额并确认，即会向 Stripe 提交真实退款。演示页面使用示例订单，不会操作真实款项。退款可能先显示待处理，最终结果以 Stripe 返回状态为准。

The automated checks cover authorization, refund validation/retry safety, database transactions, language state, sample data, search and attachment controls. Browser visual verification was unavailable in this environment. No real customer payment was charged or refunded for testing.
