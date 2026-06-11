
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse,json
from pathlib import Path
from src.rag import (
    DEFAULT_EMBEDDING_MODEL,
    build_final_output,
    build_rag_db,
    next_plot,
    previous_plot,
    sample_end_time,
    sample_start_time,
)

def read_rows(path):
    p=Path(path)
    if p.suffix.lower()=='.json':
        data=json.loads(p.read_text(encoding='utf-8'))
        if isinstance(data,dict): data=data.get('rows') or data.get('samples') or []
        if not isinstance(data,list): raise ValueError(f'{path} 必须是 JSON 数组，或包含 rows/samples 数组')
        return [(idx+1,row) for idx,row in enumerate(data) if isinstance(row,dict)]
    rows=[]
    with open(path,'r',encoding='utf-8') as f:
        for line_no,line in enumerate(f,start=1):
            if line.strip(): rows.append((line_no,json.loads(line)))
    return rows

def sample_to_case(sample, idx):
    label=sample.get('label') or {}; init=sample.get('model_initial_label') or {}; case_id=f"case_{idx:06d}_{sample.get('sample_id','unknown')}"
    final_output=build_final_output(sample,label)
    start=sample_start_time(sample); end=sample_end_time(sample)
    text='\n'.join([f"前文：{previous_plot(sample)}",f"时间：{start} - {end}",f"关键帧时间戳：{sample.get('frame_timestamps',[])}",f"台词ASR：{sample.get('dialogue','')}",f"字幕OCR：{sample.get('subtitle_ocr_text','')}",f"视觉：{sample.get('visual_caption','')}",f"动作：{sample.get('action_caption','')}",f"情绪：{sample.get('emotion_caption','')}",f"剧情含义：{sample.get('dialogue_summary','')}",f"后文：{next_plot(sample)}",f"1 是否人工审核：{final_output.get('human_reviewed')}",f"2 是否互动点：{final_output.get('is_interactive')}",f"3 互动点类型：{final_output.get('interaction_type')}",f"4 置信度：{final_output.get('confidence')}",f"5 互动开始/结束/持续时间：{json.dumps(final_output.get('timing'),ensure_ascii=False)}",f"6 为什么是/不是互动点：{final_output.get('interaction_reason')}",f"7 需要怎么互动：{json.dumps(final_output.get('interaction_plan'),ensure_ascii=False)}",f"8 前面的剧情内容：{final_output.get('previous_plot')}",f"9 后面的剧情内容：{final_output.get('next_plot')}",f"插入位置：{label.get('insert_position')}",f"可接回原剧情：{label.get('continuity_safe')}",f"不改变主线：{label.get('must_not_change_main_plot')}",f"接回条件：{label.get('resume_condition','')}",f"原因类型：{label.get('reason_type')}",f"原因：{label.get('reason','')}"])
    return {'case_id':case_id,'sample_id':sample.get('sample_id'),'text':text,'metadata':{'drama_id':sample.get('drama_id'),'episode_id':sample.get('episode_id'),'segment_id':sample.get('segment_id'),'start_time':start,'end_time':end,'frame_timestamps':sample.get('frame_timestamps',[]),'label_source':label.get('source'),'human_reviewed':final_output.get('human_reviewed'),'is_interactive':label.get('is_interactive'),'interaction_type':label.get('interaction_type'),'trigger_time':label.get('trigger_time'),'interaction_window':label.get('interaction_window'),'final_output':final_output,'insert_position':label.get('insert_position'),'continuity_safe':label.get('continuity_safe'),'must_not_change_main_plot':label.get('must_not_change_main_plot'),'resume_condition':label.get('resume_condition'),'reason_type':label.get('reason_type'),'requires_visual':label.get('requires_visual'),'confidence_label':label.get('confidence_label',label.get('confidence')),'model_initial_interaction_type':init.get('interaction_type'),'model_initial_interaction_window':init.get('interaction_window')}}

def validate_label(sample):
    issues=[]; label=sample.get('label') or {}; t=label.get('interaction_type','none'); allowed={'高光弹幕','分支创建','动作互动'}; window=label.get('interaction_window')
    if t in allowed:
        if not label.get('is_interactive'): issues.append('互动类型样本 is_interactive 不是 true')
        if label.get('trigger_time') is None: issues.append('互动样本 trigger_time 是 null')
        if not isinstance(window,dict): issues.append('互动样本 interaction_window 缺失')
        else:
            try:
                ws=float(window.get('start')); we=float(window.get('end')); wd=float(window.get('duration')); s=sample_start_time(sample); e=sample_end_time(sample)
                if ws<s or we>e or ws>=we: issues.append('interaction_window 不在 segment 范围内或 start/end 非法')
                if abs((we-ws)-wd)>0.05: issues.append('duration 与 end-start 不一致')
            except Exception: issues.append('interaction_window 数值非法')
        if label.get('must_not_change_main_plot') is not True: issues.append('must_not_change_main_plot 必须为 true')
        if label.get('continuity_safe') is not True: issues.append('互动样本 continuity_safe 应为 true')
        if not build_final_output(sample,label).get('interaction_plan'): issues.append('互动样本 final_output.interaction_plan 缺失')
        if t=='分支创建':
            options=build_final_output(sample,label).get('interaction_plan',{}).get('branch_creation',{}).get('options',[])
            if not any(o.get('branchOutcome')=='MAINLINE' for o in options): issues.append('分支创建缺少 MAINLINE 选项')
            if not any(o.get('branchOutcome')=='TRIAL' for o in options): issues.append('分支创建缺少 TRIAL 试错选项')
        if t=='动作互动' and not build_final_output(sample,label).get('interaction_plan',{}).get('action_interaction'): issues.append('动作互动缺少 action_interaction')
        if t=='高光弹幕' and not build_final_output(sample,label).get('interaction_plan',{}).get('highlight_barrage'): issues.append('高光弹幕缺少 highlight_barrage')
    else:
        if label.get('is_interactive'): issues.append('none 样本 is_interactive 是 true')
        if label.get('trigger_time') is not None: issues.append('none 样本 trigger_time 应为 null')
        if window is not None: issues.append('none 样本 interaction_window 应为 null')
    return issues

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--samples',default='data/samples/seed_samples_labeled_final.jsonl'); ap.add_argument('--cases',default='data/rag/rag_cases_v1.jsonl'); ap.add_argument('--db',default='data/rag/rag_cases_v1.sqlite'); ap.add_argument('--min-confidence-label',type=float,default=0); ap.add_argument('--require-human',action='store_true'); ap.add_argument('--strict',action='store_true'); ap.add_argument('--embedding-model',default=DEFAULT_EMBEDDING_MODEL); ap.add_argument('--embedding-device',default=None); ap.add_argument('--embedding-batch-size',type=int,default=32); ap.add_argument('--skip-embeddings',action='store_true'); args=ap.parse_args()
    Path(args.cases).parent.mkdir(parents=True,exist_ok=True); cases=[]; total=skip_no=skip_h=skip_c=issues_n=0
    for line_no,sample in read_rows(args.samples):
        total+=1; label=sample.get('label')
        if not label: skip_no+=1; continue
        if args.require_human and label.get('source')!='human': skip_h+=1; continue
        try: conf=float(label.get('confidence_label',label.get('confidence',5)))
        except Exception: conf=0
        if conf<args.min_confidence_label: skip_c+=1; continue
        issues=validate_label(sample)
        if issues:
            issues_n+=1; msg=f"[WARN] line {line_no} sample_id={sample.get('sample_id')} 标签可能有问题：{'; '.join(issues)}"
            if args.strict: raise ValueError(msg)
            print(msg)
        cases.append(sample_to_case(sample,len(cases)+1))
    with open(args.cases,'w',encoding='utf-8') as f:
        for c in cases: f.write(json.dumps(c,ensure_ascii=False)+'\n')
    Path(args.db).parent.mkdir(parents=True,exist_ok=True)
    build_rag_db(args.cases,args.db,embedding_model=args.embedding_model,embedding_device=args.embedding_device,embedding_batch_size=args.embedding_batch_size,build_embeddings=not args.skip_embeddings)
    print(f'输入 samples: {args.samples}，共 {total} 条'); print(f'跳过无 label: {skip_no}'); print(f'跳过非 human: {skip_h}'); print(f'跳过低置信度: {skip_c}'); print(f'标签潜在问题: {issues_n}'); print(f'RAG cases: {args.cases}，共 {len(cases)} 条'); print(f'RAG sqlite: {args.db}'); print(f'Embedding model: {args.embedding_model if not args.skip_embeddings else "skipped"}')
if __name__=='__main__': main()
