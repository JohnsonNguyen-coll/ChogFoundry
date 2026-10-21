import React, {useEffect, useId, useRef} from 'react';

export default function Modal({open,onClose,title,children,className='',eyebrow='BEFORE YOU CONFIRM'}) {
  const dialog=useRef(null),heading=useId();
  useEffect(()=>{
    const element=dialog.current;
    if(!open){if(element.open)element.close();return;}
    const previousOverflow=document.body.style.overflow;
    element.showModal();
    document.body.style.overflow='hidden';
    return()=>{
      if(element.open)element.close();
      document.body.style.overflow=previousOverflow;
    };
  },[open]);
  return <dialog ref={dialog} className={`foundry-modal ${className}`} aria-labelledby={heading}
    onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{
      if(event.target!==dialog.current)return;
      const rect=dialog.current.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();
    }}>
    <header className="foundry-modal-header"><div><span className="eyebrow">{eyebrow}</span><h2 id={heading}>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">Close</button></header>
    <div className="foundry-modal-content">{children}</div>
  </dialog>;
}
