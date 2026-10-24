export const unseenChatRequests=(requests,userId)=>requests.filter(r=>r.recipient===userId&&r.status==='pending'&&!r.recipient_seen_at);
export function contactUnreadCounts(messages,requests,userId,activePerson=null) {
 const byPerson=new Map();let messageCount=0;
 for(const row of messages){const count=row.person_id===activePerson?0:Number(row.total)||0;if(count>0){messageCount+=count;byPerson.set(row.person_id,(byPerson.get(row.person_id)||0)+count);}}
 const pending=unseenChatRequests(requests,userId);
 for(const request of pending)byPerson.set(request.sender,(byPerson.get(request.sender)||0)+1);
 return {total:messageCount+pending.length,messages:messageCount,requests:pending.length,byPerson};
}
