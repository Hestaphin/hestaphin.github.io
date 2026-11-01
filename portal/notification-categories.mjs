export const NOTIFICATION_CATEGORIES=Object.freeze(['announcement','resource','score','social','other']);
const notificationCategoryLabels={announcement:'Announcement',resource:'Resource',score:'Score',social:'Social',other:'Other'};
export function notificationCategory(value){return NOTIFICATION_CATEGORIES.includes(value)?value:'other';}
export function validateNotificationCategory(value){if(!NOTIFICATION_CATEGORIES.includes(value))throw Error('Choose a notification category.');return value;}
export function notificationCategoryLabel(value){return notificationCategoryLabels[notificationCategory(value)];}
export function notificationCategoryOptions(value='other',includeAll=false){
 const selected=includeAll&&value===''?'':notificationCategory(value);
 return (includeAll?`<option value=""${selected===''?' selected':''}>All categories</option>`:'')+NOTIFICATION_CATEGORIES.map(key=>`<option value="${key}"${key===selected?' selected':''}>${notificationCategoryLabels[key]}</option>`).join('');
}
