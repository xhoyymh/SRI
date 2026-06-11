
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""1_prepare_dataset.py - 批量拼图 + 互动持续窗口版。"""
import argparse, hashlib, json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import cv2, numpy as np
from tqdm import tqdm
from src.doubao_client import call_doubao_json, image_to_data_url
from src.prompts import BATCH_CAPTION_JUDGE_PROMPT, FEATURE_PROMPT
from src.rag import attach_final_output, compact_review_row, normalize_judgement

def safe_slug(text: str, prefix: str='id') -> str:
    keep=[]
    for ch in str(text):
        keep.append(ch if ch.isascii() and (ch.isalnum() or ch in ('-','_','.')) else '_')
    s=''.join(keep).strip('._-')
    while '__' in s: s=s.replace('__','_')
    if not s: s=f"{prefix}_{hashlib.md5(str(text).encode('utf-8')).hexdigest()[:8]}"
    return s[:80]

def iter_videos(input_dir: str) -> List[Path]:
    return sorted([p for p in Path(input_dir).rglob('*') if p.suffix.lower() in {'.mp4','.mov','.mkv','.avi'}])

def infer_ids(video_path: Path, input_dir: str) -> Tuple[str,str]:
    rel=video_path.relative_to(input_dir)
    return (rel.parts[0], video_path.stem) if len(rel.parts)>=2 else ('drama_unknown', video_path.stem)

def get_duration(video_path: str) -> float:
    cap=cv2.VideoCapture(video_path); fps=cap.get(cv2.CAP_PROP_FPS) or 25; frames=cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0; cap.release(); return float(frames/fps) if fps>0 else 0.0

def write_jsonl(path: str, rows: List[Dict[str,Any]]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path,'w',encoding='utf-8') as f:
        for r in rows: f.write(json.dumps(r,ensure_ascii=False)+'\n')

def read_image_unicode(path: str):
    return cv2.imdecode(np.frombuffer(Path(path).read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)

def write_jpg_unicode(path: Path, frame, quality: int=75) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok,buf=cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    if not ok: return False
    path.write_bytes(buf.tobytes()); return path.exists()

def extract_frames(video_path: str, out_dir: str, start: float, end: float, frame_count: int, jpeg_quality: int):
    Path(out_dir).mkdir(parents=True, exist_ok=True); cap=cv2.VideoCapture(video_path)
    duration=max(0.01,end-start); paths=[]; timestamps=[]
    for i in range(frame_count):
        t=start+duration*(i+1)/(frame_count+1); cap.set(cv2.CAP_PROP_POS_MSEC,t*1000); ok,frame=cap.read()
        if not ok or frame is None: continue
        out=Path(out_dir)/f'frame_{i:02d}_{t:.2f}.jpg'
        if write_jpg_unicode(out, frame, jpeg_quality): paths.append(str(out)); timestamps.append(round(float(t),3))
    cap.release(); return paths,timestamps

def build_segments(input_dir: str, out_root: str, segment_seconds: int, frame_count: int, jpeg_quality: int):
    all_segments=[]
    for video in tqdm(iter_videos(input_dir), desc='抽帧切片'):
        drama_id,episode_id=infer_ids(video,input_dir); drama_key=safe_slug(drama_id,'drama'); episode_key=safe_slug(episode_id,'ep')
        dur=get_duration(str(video)); n=int((dur+segment_seconds-1)//segment_seconds)
        for idx in range(n):
            start=idx*segment_seconds; end=min(dur,(idx+1)*segment_seconds)
            if end<=start: continue
            segment_id=f'seg{idx:05d}'; sample_id=f"{safe_slug(drama_id,'drama')}_{safe_slug(episode_id,'ep')}_{segment_id}"
            frame_dir=Path(out_root)/'frames'/drama_key/episode_key/segment_id
            frame_paths,frame_timestamps=extract_frames(str(video),str(frame_dir),start,end,frame_count,jpeg_quality)
            all_segments.append({'sample_id':sample_id,'drama_id':drama_id,'episode_id':episode_id,'segment_id':segment_id,'video_path':str(video),'start_time':round(float(start),3),'end_time':round(float(end),3),'frame_paths':frame_paths,'frame_timestamps':frame_timestamps,'dialogue':'','subtitle_ocr_text':''})
    return all_segments

def run_asr(input_dir: str, out_dir: str, model_size: str, device: str, compute_type: str, language: str):
    try:
        from faster_whisper import WhisperModel
    except Exception as e:
        print(f'[WARN] faster-whisper 未安装，跳过 ASR：{e}'); return {}
    Path(out_dir).mkdir(parents=True, exist_ok=True); model=WhisperModel(model_size, device=device, compute_type=compute_type); result={}
    for video in tqdm(iter_videos(input_dir), desc='ASR识别'):
        drama_id,episode_id=infer_ids(video,input_dir); key=f'{drama_id}_{episode_id}'; segs,_=model.transcribe(str(video), language=language, beam_size=5)
        items=[{'start':float(s.start),'end':float(s.end),'speaker':'','text':s.text.strip()} for s in segs]
        result[key]=items
        with open(Path(out_dir)/f"{safe_slug(key,'asr')}_asr.jsonl",'w',encoding='utf-8') as f:
            for x in items: f.write(json.dumps(x,ensure_ascii=False)+'\n')
    return result

def load_asr_from_dir(asr_dir: str):
    result={}; p=Path(asr_dir)
    if not p.exists(): return result
    for file in p.glob('*_asr.jsonl'):
        result[file.name.replace('_asr.jsonl','')]=[json.loads(line) for line in file.read_text(encoding='utf-8').splitlines() if line.strip()]
    return result

def attach_asr(segments, asr_map):
    for seg in segments:
        key=f"{seg['drama_id']}_{seg['episode_id']}"; texts=[]
        for a in asr_map.get(key,[]):
            if a['end']>=seg['start_time'] and a['start']<=seg['end_time']: texts.append(a.get('text',''))
        seg['dialogue']=' '.join(texts).strip(); seg['dialogue_source']='asr' if texts else 'none'

def init_paddleocr():
    from paddleocr import PaddleOCR
    last=None
    for kwargs in [{'use_textline_orientation':False,'lang':'ch'},{'use_angle_cls':False,'lang':'ch'},{'lang':'ch'}]:
        try: return PaddleOCR(**kwargs)
        except Exception as e: last=e
    raise RuntimeError(f'PaddleOCR 初始化失败：{last}')

def parse_ocr_result(res):
    items=[]
    if not res: return items
    try:
        lines=res[0] if isinstance(res,list) and res and isinstance(res[0],list) else res
        for line in lines or []:
            if isinstance(line,(list,tuple)) and len(line)>=2 and isinstance(line[1],(list,tuple)) and len(line[1])>=2:
                text=str(line[1][0]).strip(); conf=float(line[1][1])
                if text: items.append((text,conf))
    except Exception: pass
    try:
        if isinstance(res,dict):
            for t,s in zip(res.get('rec_texts') or [], res.get('rec_scores') or []):
                if str(t).strip(): items.append((str(t).strip(), float(s)))
    except Exception: pass
    return items

def run_ocr_for_segments(segments, crop_bottom_ratio, min_conf):
    try: ocr=init_paddleocr()
    except Exception as e: print(f'[WARN] PaddleOCR 初始化失败，跳过 OCR：{e}'); return
    for seg in tqdm(segments, desc='字幕OCR'):
        texts=[]
        for img_path in seg.get('frame_paths',[]):
            img=read_image_unicode(img_path)
            if img is None: continue
            h=img.shape[0]; crop=img[int(h*(1-crop_bottom_ratio)):h,:]
            for text,conf in parse_ocr_result(ocr.ocr(crop)):
                if conf>=min_conf and text.strip(): texts.append(text.strip())
        seen=set(); uniq=[]
        for t in texts:
            if t not in seen: seen.add(t); uniq.append(t)
        seg['subtitle_ocr_text']=' '.join(uniq)

def batched(items, batch_size): return [items[i:i+batch_size] for i in range(0,len(items),batch_size)]

def make_contact_sheet(batch_segments, out_path, thumb_width=360, thumb_height=240, columns=3):
    from PIL import Image, ImageDraw, ImageFont
    frame_items=[]
    for seg in batch_segments:
        for path,ts in zip(seg.get('frame_paths',[]),seg.get('frame_timestamps',[])):
            if Path(path).exists(): frame_items.append({'path':path,'segment_id':seg['segment_id'],'timestamp':ts})
    if not frame_items: raise RuntimeError('当前 batch 没有可用关键帧，无法生成拼图。')
    rows=(len(frame_items)+columns-1)//columns; label_h=34; pad=12; cell_w=thumb_width+pad*2; cell_h=thumb_height+label_h+pad*2
    sheet=Image.new('RGB',(columns*cell_w,rows*cell_h),'white'); draw=ImageDraw.Draw(sheet)
    try: font=ImageFont.truetype('arial.ttf',18)
    except Exception: font=ImageFont.load_default()
    for idx,item in enumerate(frame_items):
        row=idx//columns; col=idx%columns; x0=col*cell_w+pad; y0=row*cell_h+pad
        img=Image.open(item['path']).convert('RGB'); img.thumbnail((thumb_width,thumb_height)); canvas=Image.new('RGB',(thumb_width,thumb_height),'white')
        canvas.paste(img,((thumb_width-img.width)//2,(thumb_height-img.height)//2)); sheet.paste(canvas,(x0,y0))
        label=f"{item['segment_id']} | t={float(item['timestamp']):.2f}s"; draw.rectangle([x0,y0+thumb_height,x0+thumb_width,y0+thumb_height+label_h], fill=(245,245,245)); draw.text((x0+6,y0+thumb_height+7), label, fill=(0,0,0), font=font)
    Path(out_path).parent.mkdir(parents=True,exist_ok=True); sheet.save(out_path,quality=80); return out_path

def build_segment_specs(batch_segments):
    return json.dumps([{'sample_id':s['sample_id'],'segment_id':s['segment_id'],'start_time':s['start_time'],'end_time':s['end_time'],'frame_timestamps':s.get('frame_timestamps',[]),'dialogue':s.get('dialogue',''),'subtitle_ocr_text':s.get('subtitle_ocr_text','')} for s in batch_segments], ensure_ascii=False, indent=2)

def _as_float(x, default=None):
    try: return float(x)
    except Exception: return default

def normalize_window(window, seg, interaction_type, trigger_time):
    start_seg=float(seg.get('start_time',0)); end_seg=float(seg.get('end_time',start_seg)); seg_duration=max(0.001,end_seg-start_seg)
    s=e=None
    if isinstance(window,dict): s=_as_float(window.get('start')); e=_as_float(window.get('end'))
    if s is None or e is None:
        if trigger_time is None: return None
        default_dur=min(4.0 if interaction_type=='高光弹幕' else 6.0 if interaction_type=='分支创建' else 8.0, seg_duration)
        s=trigger_time; e=min(end_seg,s+default_dur)
        if e<=s: s=max(start_seg,trigger_time-default_dur); e=trigger_time
    s=max(start_seg,min(float(s),end_seg)); e=max(start_seg,min(float(e),end_seg))
    if e<=s: return None
    return {'start':round(s,3),'end':round(e,3),'duration':round(e-s,3)}

def normalize_interaction_label(item, seg):
    return normalize_judgement(item or {}, seg, source='doubao_initial', human_reviewed=False)

def summarize_plot(sample):
    return sample.get('dialogue_summary') or sample.get('dialogue') or sample.get('visual_caption') or sample.get('action_caption') or ''

def attach_neighbor_context_and_final_output(samples):
    groups={}
    for sample in samples:
        groups.setdefault((sample.get('drama_id'),sample.get('episode_id')),[]).append(sample)
    for rows in groups.values():
        rows.sort(key=lambda x: float(x.get('start_time',0) or 0))
        for idx,row in enumerate(rows):
            row['previous_context']=row.get('previous_context') or (summarize_plot(rows[idx-1]) if idx>0 else '')
            row['next_context']=row.get('next_context') or (summarize_plot(rows[idx+1]) if idx+1<len(rows) else '')
            attach_final_output(row,'label')

def doubao_caption_judge_batch(batch_segments, sheet_path, temperature, max_tokens):
    prompt=BATCH_CAPTION_JUDGE_PROMPT.format(segment_specs=build_segment_specs(batch_segments))
    messages=[{'role':'system','content':'你是严谨的短剧片段理解与互动窗口初筛助手，只输出合法 JSON。'}, {'role':'user','content':[{'type':'text','text':prompt},{'type':'image_url','image_url':{'url':image_to_data_url(sheet_path)}}]}]
    return call_doubao_json(messages, temperature=temperature, max_tokens=max_tokens)

def build_samples_with_doubao_batched(segments, work_dir, batch_segments, sheet_columns, thumb_width, thumb_height, temperature, max_tokens, feature_call):
    samples=[]
    for batch_idx,batch in enumerate(tqdm(batched(segments,batch_segments), desc='Doubao批量图文理解+互动窗口初判')):
        sheet_path=str(Path(work_dir)/'contact_sheets'/f'batch_{batch_idx:06d}.jpg')
        try:
            make_contact_sheet(batch,sheet_path,thumb_width,thumb_height,sheet_columns); result=doubao_caption_judge_batch(batch,sheet_path,temperature,max_tokens)
        except Exception as e:
            print(f'[WARN] batch {batch_idx} Doubao 调用失败：{e}'); result={'segments':[]}
        by_sample_id={str(x.get('sample_id')):x for x in result.get('segments',[]) if isinstance(x,dict) and x.get('sample_id')}
        for seg in batch:
            item=by_sample_id.get(seg['sample_id'],{}); initial_label=normalize_interaction_label(item,seg); sample={**seg}
            sample.update({'visual_caption':item.get('visual_caption',''),'action_caption':item.get('action_caption',''),'emotion_caption':item.get('emotion_caption',''),'dialogue_summary':item.get('dialogue_summary',''),'ocr_text':item.get('ocr_text',seg.get('subtitle_ocr_text','')),'characters':item.get('characters',[]),'location':item.get('location',''),'objects':item.get('objects',[]),'plot_functions':item.get('plot_functions',[]),'candidate_interaction_types':[initial_label['interaction_type']] if initial_label['interaction_type']!='none' else ['none'],'retrieval_keywords':item.get('retrieval_keywords',[]),'previous_context':item.get('previous_context',''),'next_context':item.get('next_context',''),'model_initial_label':initial_label,'label':initial_label,'label_need_review':True,'prediction':None,'contact_sheet_path':sheet_path})
            sample['features']={'plot_functions':sample.get('plot_functions',[]),'candidate_types':sample.get('candidate_interaction_types',[]),'retrieval_keywords':sample.get('retrieval_keywords',[]),'has_insertable_window':initial_label.get('interaction_window') is not None,'continuity_safe':initial_label.get('continuity_safe',False)}
            samples.append(sample)
    attach_neighbor_context_and_final_output(samples)
    return samples

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--input-dir',default='data/raw_videos_seed'); ap.add_argument('--out',default='data/samples/seed_samples_unlabeled.jsonl'); ap.add_argument('--work-dir',default='data/work_seed')
    ap.add_argument('--segment-seconds',type=int,default=30); ap.add_argument('--frame-count',type=int,default=9); ap.add_argument('--jpeg-quality',type=int,default=75)
    ap.add_argument('--skip-asr',action='store_true'); ap.add_argument('--asr-dir',default=''); ap.add_argument('--asr-model-size',default='medium'); ap.add_argument('--asr-device',default='cuda'); ap.add_argument('--asr-compute-type',default='float16'); ap.add_argument('--language',default='zh')
    ap.add_argument('--skip-ocr',action='store_true'); ap.add_argument('--ocr-crop-bottom-ratio',type=float,default=0.32); ap.add_argument('--ocr-min-conf',type=float,default=0.55)
    ap.add_argument('--batch-segments',type=int,default=3); ap.add_argument('--sheet-columns',type=int,default=3); ap.add_argument('--thumb-width',type=int,default=360); ap.add_argument('--thumb-height',type=int,default=240); ap.add_argument('--temperature',type=float,default=0.0); ap.add_argument('--max-tokens',type=int,default=4096); ap.add_argument('--feature-call',action='store_true'); ap.add_argument('--full-output',action='store_true',help='输出完整调试字段；默认输出适合人工审核的精简 JSONL')
    args=ap.parse_args(); Path(args.work_dir).mkdir(parents=True,exist_ok=True)
    print('[1/5] 切片抽帧'); segments=build_segments(args.input_dir,args.work_dir,args.segment_seconds,args.frame_count,args.jpeg_quality); write_jsonl(str(Path(args.work_dir)/'segments_raw.jsonl'),segments)
    print('[2/5] ASR 台词识别/加载')
    asr_map={} if args.skip_asr else load_asr_from_dir(args.asr_dir) if args.asr_dir else run_asr(args.input_dir,str(Path(args.work_dir)/'asr'),args.asr_model_size,args.asr_device,args.asr_compute_type,args.language)
    attach_asr(segments,asr_map)
    print('[3/5] 字幕 OCR')
    if not args.skip_ocr: run_ocr_for_segments(segments,args.ocr_crop_bottom_ratio,args.ocr_min_conf)
    else: print('已跳过 OCR。')
    write_jsonl(str(Path(args.work_dir)/'segments_with_dialogue.jsonl'),segments)
    print('[4/5] Doubao：批量拼图 + ASR/OCR 融合理解 + 互动窗口初判')
    samples=build_samples_with_doubao_batched(segments,args.work_dir,args.batch_segments,args.sheet_columns,args.thumb_width,args.thumb_height,args.temperature,args.max_tokens,args.feature_call)
    if not args.full_output:
        samples=[compact_review_row(sample,'label') for sample in samples]
    print('[5/5] 写出待人工复核 samples'); write_jsonl(args.out,samples); print(f'完成：{args.out}')
if __name__=='__main__': main()
