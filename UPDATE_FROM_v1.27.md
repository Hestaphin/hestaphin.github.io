# COPKU v1.28

The connected Orchestra database update is already applied. No new Supabase key, Stripe setting or manual SQL step is required. Publish the complete files inside `COPKU_Website_v1.28` to your existing website and refresh.

## Discussion posts and replies

Administrators can delete every reply and post. Members can delete their own posts and their own replies. A post's author does not gain permission to delete other people's individual replies. These rules are enforced by Supabase row policies as well as the visible buttons.

Delete controls are available in the discussion list/detail and beside permitted replies. A confirmation appears before deletion. Deleting a whole post removes its discussion and reply notices. Deleting one reply keeps other replies to it, removing only their link to the deleted parent; it does not silently delete another member's content.

## New-task member selection

The new-task page now uses the same Department, Occupation, Instrument, Classification, Rank and Status multi-select filters as Accounts. Different categories combine; selections within one category are alternatives. The table includes Rank and Status alongside names and instruments, with smaller text and adjusted column widths.

Changing filters preserves the task draft, attachments, selected recipients and their Mandatory/Optional/Urgent choices. The page shows total selected members and how many selected members are hidden by filters. **Select shown**, department/group selectors, and the bulk Mandatory/Optional/Urgent controls affect only currently displayed rows. **Clear selection** clears all recipients, including hidden selections. Sending includes all checked recipients; the visible counts make hidden selections clear before submission.

## Language

The switch now reads **EN / 中文**. Portal group names and Join us subtitles use **管弦乐队 / 管乐队**. The orchestra's official full Chinese name remains **北京未名室内管弦乐团**.

## Validation and restore record

Applied `supabase/portal/06_portal_v128.sql` to COPKU DATA. It updates the post/reply delete policies and changes the parent reply reference to preserve child replies. It creates no public or anonymous delete access and changes no existing post/reply content during setup.

Rolled-back live database checks cover owner/admin deletion, rejection of other-member deletions, preservation of child replies, and whole-thread removal. UI/demo checks cover delete visibility, stable task selections, hidden counts, scoped bulk actions, requirement flags, retained drafts and the requested translations. Existing account, checkout, chat, unread and order checks also passed. Browser visual verification remains unavailable because the managed preview daemon is unavailable.

## 中文说明

管理员可以删除所有讨论及回复；成员可以删除自己的讨论和自己的回复。删除单条回复时，其他人对它的回复会保留。删除整篇讨论时会连同该讨论的回复一起删除。实际删除前会显示确认窗口，权限由数据库校验。

新任务的成员表新增职级和状态，并提供与账号管理相同的多类别、多选筛选。切换筛选不会清掉已选成员及必做/选做/紧急设置；页面会显示已选总数及被隐藏的选择数量。批量操作只影响当前显示成员，“清除选择”会清空全部选择。

语言按钮改为 EN / 中文，分组和“加入我们”副标题使用“管弦乐队 / 管乐队”；乐团正式全名仍为“北京未名室内管弦乐团”。数据库已更新，上传完整网站文件即可，无需重新配置。
