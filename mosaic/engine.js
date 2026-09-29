export function extract(source,mode){
 if(mode==='quotes'){
  const out=[];let depth=0,start=0,closer='';
  for(let i=0;i<source.length;i++){const c=source[i];if(!depth&&(c==='「'||c==='『')){depth=1;start=i+1;closer=c==='「'?'」':'』';}else if(depth&&c===closer){const s=source.slice(start,i).replace(/\r\n/g,'\n').trim();if(s)out.push(s);depth=0;}}
  return out;
 }
 if(mode==='paragraphs')return source.replace(/\r\n/g,'\n').split(/\n[ \t]*\n+/).map(t=>t.trim()).filter(Boolean);
 return source.split(/\r?\n/).map(t=>t.trim()).filter(Boolean);
}
export function validate(phrases){if(!phrases.length)throw new Error('画像に使うことばを入力してください。');if(phrases.length>300)throw new Error('300件まで配置できます。「使うことばを編集」で件数を減らしてください。');if(phrases.join('').length>15000)throw new Error('合計15,000文字までです。ログを分けるか、使うことばを絞ってください。');}
export function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// Rule-based suggestions remain editable; this does not infer the speaker's feelings.
export function strongPhrase(text){return /愛して(?:い)?る|愛しています|大好き|ずっと一緒|誰より(?:も)?大切|絶対に守る|守り抜く|離さない/u.test(text);}
export function emphasisFor(text,mode='auto',automatic=true){return mode==='strong'||mode==='auto'&&automatic&&strongPhrase(text);}
export function tiles(phrases,width,height,seed,variety,emphasis=[],boost=9){
 const rng=random(seed);const items=phrases.map((text,id)=>({id,text,weight:Math.max(2,[...text].length)*Math.exp((rng()-.5)*3.7*variety)*(rng()<.12?1+2*variety:1)*(emphasis[id]?boost:1),emphasized:!!emphasis[id],bold:rng()>.5,tint:rng(),vertical:rng()<.32}));
 for(let i=items.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
 const result=[];
 function cut(list,x,y,w,h){if(list.length===1){result.push({...list[0],x,y,w,h});return;}const sum=list.reduce((s,t)=>s+t.weight,0);let acc=0,best=1,diff=Infinity;for(let i=1;i<list.length;i++){acc+=list[i-1].weight;const d=Math.abs(acc/sum-.5);if(d<diff){diff=d;best=i;}}
 const left=list.slice(0,best),ratio=left.reduce((s,t)=>s+t.weight,0)/sum;
 if(w>=h){cut(left,x,y,w*ratio,h);cut(list.slice(best),x+w*ratio,y,w*(1-ratio),h);}else{cut(left,x,y,w,h*ratio);cut(list.slice(best),x,y+h*ratio,w,h*(1-ratio));}}
 cut(items,0,0,width,height);return result;
}
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ja',{granularity:'grapheme'}):null;
const glyphs=t=>segmenter?Array.from(segmenter.segment(t),v=>v.segment):Array.from(t);
export function fit(ctx,text,w,h,font,weight,vertical,preserve=0){
 const strength=Math.max(0,Math.min(1,preserve));const segments=text.replace(/\r\n/g,'\n').split('\n').map(glyphs);const chars=segments.flat();ctx.font=`${weight} 100px ${font}`;
 const measure=c=>vertical?1:ctx.measureText(c).width/100;
 const widths=new Map(chars.map(c=>[c,measure(c)]));
 const linesFrom=groups=>groups.map(c=>({chars:c,text:c.join(''),width:c.reduce((a,v)=>a+widths.get(v),0)}));
 let best,bestScore=-Infinity;
 function consider(groups,missed=0){
  const lines=linesFrom(groups),extra=Math.max(0,lines.length-segments.length),widest=Math.max(.01,...lines.map(l=>l.width));
  const size=vertical?Math.min(w/(lines.length*1.06),h/(widest*1.04)):Math.min(w/widest,h/(lines.length*1.08));
  // Missing an explicit break costs more than adding a wrap; sentence punctuation is preferred.
  let rough=0;for(let i=0;i<lines.length-1;i++){if(!/[、。！？!?；;，,：:]$/.test(lines[i].text))rough++;}
  const cost=(missed*4+extra+rough*.25)/Math.max(1,segments.length);
  const score=size/(1+(strength/(1-strength||.00001))*cost*2);
  if(score>bestScore){bestScore=score;best={size,lines,vertical,cols:lines.length,rows:Math.max(...groups.map(g=>g.length),1),columns:groups,chars};}
 }
 consider(segments);if(strength===1)return best;
 const wrap=(group,target)=>{const out=[];let line=[],span=0;for(const char of group){const value=widths.get(char);if(line.length&&span+value>target&&!/^[、。，．！？!?）」』】〉》〕］]/u.test(char)){out.push(line);line=[];span=0;}line.push(char);span+=value;}out.push(line);return out;};
 const total=chars.reduce((v,c)=>v+widths.get(c),0);
 for(let wanted=1;wanted<=Math.min(chars.length,100);wanted++){
  const target=total/wanted;consider(wrap(chars,target),segments.length-1);
  if(segments.length>1)consider(segments.flatMap(group=>wrap(group,target)));
 }
 return best;
}
export function render(canvas,phrases,options){
 validate(phrases);canvas.width=options.width;canvas.height=options.height;const ctx=canvas.getContext('2d');ctx.fillStyle=options.paper;ctx.fillRect(0,0,canvas.width,canvas.height);const layout=tiles(phrases,canvas.width,canvas.height,options.seed,options.variety,options.emphasis||[],1+(options.emphasisLevel??3)*3);let minFont=Infinity,verticalCount=0;
 for(const tile of layout){const pad=Math.min(options.gap,Math.min(tile.w,tile.h)*.08);const w=Math.max(.1,tile.w-pad*2),h=Math.max(.1,tile.h-pad*2);const weight=tile.emphasized||options.bold&&tile.bold?800:500;
  let vertical=options.direction==='vertical'||options.direction==='mixed'&&(tile.h>tile.w*1.45||tile.vertical&&tile.h>tile.w*.65);
  if(options.direction==='mixed'&&/[a-zA-Z]{4}/.test(tile.text))vertical=false;
  const f=fit(ctx,tile.text,w,h,options.font,weight,vertical,options.preserve||0);minFont=Math.min(minFont,f.size);if(vertical)verticalCount++;
  ctx.save();ctx.beginPath();ctx.rect(tile.x,tile.y,tile.w,tile.h);ctx.clip();ctx.fillStyle=!options.mono&&(tile.emphasized||tile.tint<.23)?options.accent:options.ink;ctx.font=`${weight} ${f.size}px ${options.font}`;ctx.textAlign='center';ctx.textBaseline='middle';
  if(vertical){const stepX=f.size*1.06,stepY=f.size*1.04;const startX=tile.x+tile.w/2+(f.cols-1)*stepX/2,startY=tile.y+pad+(h-f.rows*stepY)/2+stepY/2;
   f.columns.forEach((column,col)=>column.forEach((char,row)=>{ctx.save();ctx.translate(startX-col*stepX,startY+row*stepY);if(/^[ー―—─…「」『』（）()\[\]【】〈〉《》]$/u.test(char))ctx.rotate(Math.PI/2);if(/^[、。，．]$/u.test(char)){ctx.translate(f.size*.25,-f.size*.25);}ctx.fillText(char,0,0);ctx.restore();}));
  }else{const step=f.size*1.08,startY=tile.y+pad+(h-f.lines.length*step)/2+step/2;f.lines.forEach((line,i)=>ctx.fillText(line.text,tile.x+tile.w/2,startY+i*step));}ctx.restore();
 }
 return {count:layout.length,emphasized:layout.filter(t=>t.emphasized).length,minFont,verticalCount,width:canvas.width,height:canvas.height};
}
