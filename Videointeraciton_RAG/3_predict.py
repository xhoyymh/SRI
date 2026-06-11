
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse,json,time
from collections import defaultdict
from pathlib import Path
from tqdm import tqdm
from src.doubao_client import call_doubao_json
from src.prompts import JUDGE_PROMPT
from src.rag import (
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_RERANKER_MODEL,
    attach_final_output,
    build_video_generation_tasks,
    normalize_judgement,
    next_plot,
    previous_plot,
    retrieve_cases,
    format_cases,
    sample_end_time,
    sample_start_time,
)

def count_jsonl_rows(path):
    with open(path,'r',encoding='utf-8') as f:
        return sum(1 for line in f if line.strip())

def format_duration(seconds):
    seconds=int(seconds)
    h,rem=divmod(seconds,3600)
    m,s=divmod(rem,60)
    return f'{h:02d}:{m:02d}:{s:02d}'

def predict_one(sample, rag_db, rag_recall_k, rag_top_k, temperature, retrieval_mode, rerank_mode, embedding_model, embedding_device, embedding_batch_size, reranker_model, reranker_device, reranker_batch_size, rag_max_none, rag_min_positive):
    cases=retrieve_cases(rag_db, sample, recall_k=rag_recall_k, top_k=rag_top_k, retrieval_mode=retrieval_mode, rerank_mode=rerank_mode, embedding_model=embedding_model, embedding_device=embedding_device, embedding_batch_size=embedding_batch_size, reranker_model=reranker_model, reranker_device=reranker_device, reranker_batch_size=reranker_batch_size, max_none_cases=rag_max_none, min_positive_cases=rag_min_positive)
    prompt=JUDGE_PROMPT.format(cases=format_cases(cases),previous_context=previous_plot(sample),start_time=sample_start_time(sample),end_time=sample_end_time(sample),frame_timestamps=sample.get('frame_timestamps',[]),dialogue=sample.get('dialogue',''),subtitle_ocr_text=sample.get('subtitle_ocr_text',''),visual_caption=sample.get('visual_caption',''),action_caption=sample.get('action_caption',''),emotion_caption=sample.get('emotion_caption',''),dialogue_summary=sample.get('dialogue_summary',''),next_context=next_plot(sample))
    messages=[{'role':'system','content':'你是严谨的短剧互动窗口判断器，只输出合法 JSON。'},{'role':'user','content':prompt}]
    raw_pred=call_doubao_json(messages, temperature=temperature, max_tokens=2800)
    pred=normalize_judgement(raw_pred,sample,source='doubao',human_reviewed=False)
    sample['prediction']={'model':'doubao',**pred}; sample['rag_case_ids']=[c['case_id'] for c in cases]; sample['rag_case_scores']=[{'case_id':c['case_id'],'selection_rank':c.get('selection_rank'),'retrieval_fallback':c.get('retrieval_fallback'),'embedding_score':c.get('embedding_score'),'fts_score':c.get('fts_score'),'recall_rank':c.get('recall_rank'),'raw_rerank_score':c.get('raw_rerank_score'),'quality_score':c.get('quality_score'),'rerank_score':c.get('rerank_score'),'rerank_model':c.get('rerank_model'),'human_reviewed':(c.get('metadata') or {}).get('human_reviewed'),'label_source':(c.get('metadata') or {}).get('label_source'),'is_interactive':(c.get('metadata') or {}).get('is_interactive'),'interaction_type':(c.get('metadata') or {}).get('interaction_type')} for c in cases]; attach_final_output(sample,'prediction'); return sample

def export_topk(prediction_path,out_path,top_highlight,top_action,top_branch):
    groups=defaultdict(list)
    with open(prediction_path,'r',encoding='utf-8') as f:
        for line in f:
            x=json.loads(line); groups[f"{x.get('drama_id')}_{x.get('episode_id')}"] .append(x)
    selected=[]
    for rows in groups.values():
        by_type=defaultdict(list)
        for r in rows:
            t=(r.get('prediction') or {}).get('interaction_type','none')
            if t!='none': by_type[t].append(r)
        for t,k in [('高光弹幕',top_highlight),('动作互动',top_action),('分支创建',top_branch)]:
            selected.extend(sorted(by_type.get(t,[]), key=lambda x:(x.get('prediction') or {}).get('confidence',0), reverse=True)[:k])
    Path(out_path).parent.mkdir(parents=True,exist_ok=True)
    with open(out_path,'w',encoding='utf-8') as f:
        for x in selected:
            attach_final_output(x,'prediction')
            x['review']={'human_reviewed':False,'human_accept':None,'correct_is_interactive':None,'correct_interaction_type':None,'correct_confidence':None,'correct_timing':None,'correct_interaction_reason':None,'correct_interaction_plan':None,'correct_previous_plot':None,'correct_next_plot':None,'correct_insert_position':None,'correct_continuity_safe':None,'correct_reason_type':None,'note':'人工复核时填写；确认后请把最终结果写入 label 字段。若不是互动点，interaction_type=none，保留 interaction_reason/previous_plot/next_plot，confidence/timing/interaction_plan 为 null。'}
            f.write(json.dumps(x,ensure_ascii=False)+'\n')
    print(f'Top-K review 文件：{out_path}，共 {len(selected)} 条')

def export_final_outputs(prediction_path,out_path):
    count=0
    Path(out_path).parent.mkdir(parents=True,exist_ok=True)
    with open(prediction_path,'r',encoding='utf-8') as fin, open(out_path,'w',encoding='utf-8') as fout:
        for line in fin:
            if not line.strip(): continue
            row=json.loads(line)
            attach_final_output(row,'prediction')
            fout.write(json.dumps(row['final_output'],ensure_ascii=False)+'\n')
            count+=1
    print(f'最终精简 JSONL：{out_path}，共 {count} 条')

def export_video_generation_tasks(prediction_path,out_path):
    count=0
    Path(out_path).parent.mkdir(parents=True,exist_ok=True)
    with open(prediction_path,'r',encoding='utf-8') as fin, open(out_path,'w',encoding='utf-8') as fout:
        for line in fin:
            if not line.strip(): continue
            row=json.loads(line)
            for task in build_video_generation_tasks(row):
                fout.write(json.dumps(task,ensure_ascii=False)+'\n')
                count+=1
    print(f'视频生成任务 JSONL：{out_path}，共 {count} 条')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--samples',default='data/samples/train_samples_unlabeled.jsonl'); ap.add_argument('--rag-db',default='data/rag/rag_cases_all_human_plus_auto.sqlite'); ap.add_argument('--out',default='data/predictions/predictions.jsonl'); ap.add_argument('--final-out',default='data/predictions/final_outputs.jsonl'); ap.add_argument('--video-tasks-out',default='data/predictions/video_generation_tasks.jsonl'); ap.add_argument('--review-out',default='data/review/review_topk.jsonl'); ap.add_argument('--rag-recall-k',type=int,default=24); ap.add_argument('--rag-top-k',type=int,default=6); ap.add_argument('--rag-max-none',type=int,default=3); ap.add_argument('--rag-min-positive',type=int,default=2); ap.add_argument('--retrieval-mode',choices=['embedding','fts'],default='embedding'); ap.add_argument('--rerank-mode',choices=['bge','rules','none'],default='bge'); ap.add_argument('--embedding-model',default=DEFAULT_EMBEDDING_MODEL); ap.add_argument('--embedding-device',default=None); ap.add_argument('--embedding-batch-size',type=int,default=32); ap.add_argument('--reranker-model',default=DEFAULT_RERANKER_MODEL); ap.add_argument('--reranker-device',default=None); ap.add_argument('--reranker-batch-size',type=int,default=16); ap.add_argument('--temperature',type=float,default=0.0); ap.add_argument('--top-highlight',type=int,default=5); ap.add_argument('--top-action',type=int,default=3); ap.add_argument('--top-branch',type=int,default=2); args=ap.parse_args()
    Path(args.out).parent.mkdir(parents=True,exist_ok=True)
    total=count_jsonl_rows(args.samples)
    started=time.perf_counter()
    print(f'待预测样本：{total} 条')
    print(f'RAG retrieval={args.retrieval_mode} recall_k={args.rag_recall_k}，rerank={args.rerank_mode} top_k={args.rag_top_k} max_none={args.rag_max_none} min_positive={args.rag_min_positive}')
    print(f'Embedding model: {args.embedding_model}')
    print(f'Reranker model: {args.reranker_model if args.rerank_mode=="bge" else args.rerank_mode}')
    with open(args.samples,'r',encoding='utf-8') as fin, open(args.out,'w',encoding='utf-8') as fout:
        for line in tqdm(fin,total=total,desc='RAG+Doubao互动窗口判断',unit='条'):
            if line.strip(): fout.write(json.dumps(predict_one(json.loads(line),args.rag_db,args.rag_recall_k,args.rag_top_k,args.temperature,args.retrieval_mode,args.rerank_mode,args.embedding_model,args.embedding_device,args.embedding_batch_size,args.reranker_model,args.reranker_device,args.reranker_batch_size,args.rag_max_none,args.rag_min_positive),ensure_ascii=False)+'\n')
    export_topk(args.out,args.review_out,args.top_highlight,args.top_action,args.top_branch)
    export_final_outputs(args.out,args.final_out)
    export_video_generation_tasks(args.out,args.video_tasks_out)
    elapsed=time.perf_counter()-started
    avg=elapsed/total if total else 0
    print(f'预测完成：{args.out}')
    print(f'总耗时：{format_duration(elapsed)}，平均每条：{avg:.2f}s')
if __name__=='__main__': main()
