# COPKU v1.27

The connected Supabase database and the checkout, admin order and personnel account functions have already been updated. No new key or manual setup is required. Publish the complete files inside `COPKU_Website_v1.27` to your existing website, then refresh.

## Orders and delivery

Buyers must enter a postal delivery address in Stripe Checkout before completing a new order. This includes recipient name, street address, city/province, country and postal code where applicable; the apartment/building field is available for additional detail. The existing country setting is respected. When it is unset, Stripe's supported address countries are available. Delivery is still arranged manually; no new shipping charge or promised delivery date has been added.

In **Settings → Shop orders**, click an order row or its order number once to open **Order details**. The page displays the full recipient/address fields, customer details, items, payment and delivery status, refund totals and history. Refund and Mark delivered remain connected to their existing protected server actions. Historical orders may have no address because it was not collected at the time; no address is invented for them.

## Chat and personnel

- Chat requests received while the portal is open show a popup with Review request and Later. Later leaves the request unread. Reviewing it, or opening Manage chat requests, marks the displayed received request as seen. Approval is still required before chatting.
- The Contact badge includes unread messages and unseen received chat requests. Individual contacts have their own unread counts. Messages displayed in the open, focused conversation are marked read and do not add a badge. Messages arriving while the window is hidden or unfocused stay unread until viewed.
- Realtime chat updates are enabled, with the existing polling refresh retained as a fallback. Realtime reads still use the existing participant and approved-conversation database policies.
- Contact group headings use light grey. A small grey outlined Probationary sign appears beside probationary members in contacts, their personal page, name labels and the account directory.
- Trainee and Cadet always have Probationary status. The selector is locked for those ranks, and both account functions and the database enforce the same rule. Other ranks keep the administrator's chosen valid status.
- The account directory has one row of Department, Occupation, Instrument, Classification, Rank and Status filters. Each allows multiple selections. Selections within a filter are alternatives; different filters combine. Clear filters restores the complete member table.

## Wording and appearance

Schubert's wife has been corrected to **Schumann's wife** throughout public copy and search entries. The corrected detail pages use `/events/schumann/` and `/learn/fun-facts/schumanns-wife/`; older URLs still redirect. Instructor and its ranks use **顾问**, 初级顾问, 中级顾问 and 高级顾问. The orchestra's name is larger in the title bar.

The private `/portal-preview/` uses sample accounts/orders. It can demonstrate full address details, filters, status changes and chat alerts without affecting real accounts or payments.

## Setup record

Applied `supabase/portal/05_portal_v127.sql` to COPKU DATA. The update adds recipient-only chat-request read state, enables the two chat tables for Realtime, and enforces training-rank status. It preserves existing access roles and payment history. Only the request's seen timestamp can be updated directly by its recipient; participants cannot change sender, recipient or approval status through that permission.

Deployed the included `create-shop-checkout`, `portal-admin`, `create-internal-user` and `portal-account` functions in the Orchestra project. Existing server secrets and the shop refund webhook are reused. Club membership functions remain separate.

Checks cover required shipping parameters, live checkout readiness, order authorization, address persistence, forced status, combined filters, request read permissions, request resend, popup/badge state and active-chat draft preservation. Database test records were rolled back. No real payment was charged or refunded. Browser visual verification was unavailable because the preview daemon was unavailable.

## 中文说明

已完成本次 Supabase 数据库和相关函数更新，不需要重新配置或填写密钥。上传完整 v1.27 网站文件即可。

买家在 Stripe 付款页填写完整邮寄地址。管理员在“设置 → 商店订单”单击订单，即可进入详情页查看姓名、街道、楼栋房间、城市、省州、邮编和国家地区，以及付款、配送和退款记录。旧订单未采集的地址不会自动补出。

新增在线聊天请求弹出提醒；未查看请求和未读消息计入通讯角标。正在打开且有焦点的会话收到消息后直接标为已读。Trainee / Cadet 强制为见习状态，名称旁显示灰框标记。账号列表支持多个类别、多选组合筛选。Instructor 译为“顾问”，相关活动改为“舒曼的妻子”，顶部乐团名称字号增大。
