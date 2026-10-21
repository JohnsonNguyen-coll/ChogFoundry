import React from 'react';
export const assistantTasks=[
  {id:'concept',title:'Shape an idea',description:'Explore names, themes and a story for your next token.',prompt:'Help me develop three token concepts for this studio. Suggest a name, ticker and short story for each. Use available studio information and clearly distinguish ideas from verified facts.'},
  {id:'launch',title:'Plan a launch',description:'Understand supply, your first buy and how fees work.',prompt:'Explain this studio’s launch settings in plain English: supply, creator allocation, the optional paid first buy, fees and the move to a liquidity pool. Use the approved settings and identify anything that still needs verification.'},
  {id:'community',title:'Catch up on the club',description:'Turn recent discussions into a useful shortlist.',prompt:'Summarize the recent public club messages available for this studio. Highlight proposed ideas and their authors where available. If there are no messages, say so instead of inventing a discussion.'},
  {id:'token',title:'Understand a token',description:'Review available token, liquidity and holder information.',prompt:'Explain the verified information available about the selected token: creator, contract permissions, liquidity, fees and holder concentration. Cite sources and state missing information. If no token is selected, ask me to choose one. Do not promise safety or returns.'},
];
export default function AssistantTools({active,onSelect,disabled=false}) {
  return <div className="assistant-tools">{assistantTasks.map((task,index)=><button type="button" key={task.id} className={`assistant-tool${active===task.id?' is-selected':''}`} aria-pressed={active===task.id} disabled={disabled} onClick={()=>onSelect(task)}><span className="assistant-tool-number">0{index+1}</span><strong>{task.title}</strong><span>{task.description}</span><span className="assistant-tool-action">Start here ↗</span></button>)}</div>;
}
