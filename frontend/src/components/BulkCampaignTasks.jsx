import React,{useState} from 'react';
import {communityRequest} from '../lib/community.mjs';
import {bulkTasks} from '../lib/bulk-tasks.mjs';

const initialLinks=['2113234102728179727','2112907760430092519','2112535842413805813','2112182026744836164','2111793780034502926','2110714054495092737','2110375696371777991'].map(id=>`https://x.com/ChogNFT/status/${id}`).join('\n');
export default function BulkCampaignTasks({action,onPublished}) {
  const [progress,setProgress]=useState('');
  return <form className="community-compose campaign-bulk-form" onSubmit={event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    action.run(async signal=>{
      const planned=bulkTasks(String(form.get('links')),form.getAll('kind'),Number(form.get('points')),Number(form.get('days')));
      setProgress('Checking existing tasks…');
      const existing=await communityRequest('/engagement/tasks',undefined,signal);
      if(existing.truncated)throw new Error('The task list is truncated. Use individual publishing to avoid duplicates.');
      const keys=new Set(existing.tasks.map(task=>`${task.kind}:${task.target_post_id}`));
      let published=0,skipped=0;
      for(const task of planned){
        if(signal.aborted)return;
        const key=`${task.kind}:${task.targetPostId}`;
        if(keys.has(key)){skipped++;continue;}
        setProgress(`Publishing ${published+skipped+1} of ${planned.length}…`);
        try {
          await communityRequest('/engagement/tasks',task,signal);
        } catch(error) {
          setProgress(`Stopped: ${published} published, ${skipped} already existed. Refresh tasks before retrying; completed tasks will be skipped.`);
          throw error;
        }
        keys.add(key);published++;onPublished();
      }
      const message=`${published} tasks published. ${skipped} existing tasks skipped.`;
      setProgress(message);return message;
    });
  }}>
    <h3>Publish tasks in bulk</h3>
    <p className="note">One URL per line. Each selected action earns its own points. Tasks start when you publish; existing action/post pairs are skipped.</p>
    <fieldset disabled={action.busy}>
      <label>Post URLs<textarea name="links" required rows={7} defaultValue={initialLinks}/></label>
      <div className="campaign-bulk-actions">
      <label><input type="checkbox" name="kind" value="like" defaultChecked/> Like</label>
      <label><input type="checkbox" name="kind" value="repost" defaultChecked/> Repost</label>
      </div>
      <label>Points per task<input name="points" type="number" min="1" max="1000000" defaultValue="10" required/></label>
      <label>Duration in days<input name="days" type="number" min="1" max="90" defaultValue="14" required/></label>
      <button disabled={action.busy}>{action.busy?'Publishing…':'Verify and publish tasks'}</button>
    </fieldset>
    <p role="status" aria-live="polite">{progress}</p>
    {action.error&&<p className="error" role="alert">{action.error}</p>}
  </form>;
}
