# -*- coding: utf-8 -*-

"""
prompts.py

新版互动点定义：
1. 高光弹幕：覆盖型互动，有持续展示窗口，不改变剧情。
2. 分支创建：试错型分支；主线选择继续原剧情，非主线选择展示坏结果后回到分支点重选。
3. 动作互动：主线动作过程增强；插入 AIGC 动作增强视频，但不改变原片动作结果。
4. none：不适合互动，或无法安全插入/覆盖/回到主线。
"""


BATCH_CAPTION_JUDGE_PROMPT = """
你是短剧互动点理解与初筛标注助手。你会看到一张按时间顺序排列的拼图。
拼图中每个小图下方都标注了 segment_id 和 timestamp，例如：seg00012 | t=125.00s。
请结合【拼图画面】【ASR台词】【字幕OCR】逐个 segment 输出结构化理解和互动点初判。

重要原则：
1. 必须按 segment_id 输出，不要遗漏任何 segment。
2. 不要只看图，必须结合台词理解剧情；ASR 台词优先，字幕 OCR 用于纠错和补充。
3. 如果 ASR 和 OCR 冲突，结合画面判断，尽量给出更合理的剧情理解。
4. 互动类型只能是：高光弹幕、分支创建、动作互动、none。

互动类型定义：
1. 高光弹幕：
   搞笑、爽点、打脸、反转、甜宠、社死、震惊等强情绪点；不生成新剧情视频，只做弹幕/贴纸/特效/音效覆盖展示；必须给一个持续展示时间段；不能改变剧情。

2. 分支创建：
   角色处于明确行动选择前，存在一个主线正确选择和一个或多个非主线试错选择。
   用户选择非主线时，需要插入短 AIGC 视频展示错误选择导致的不良后果，例如失败、暴露、受伤、错过时机、触发危机、被误导。
   非主线试错分支结束后必须回到分支点，让用户重新选择。
   只有选择主线正确选项，才能继续原片后续剧情。
   分支创建不是“所有分支都进入后续主线”，而是“错误分支回选择点，正确分支进主线”。

3. 动作互动：
   角色正在执行或即将执行明确动作目标，用户操作可以增强动作过程，并插入一段短 AIGC 动作增强视频。
   动作互动只能强化过程表现，不能改变原片动作结果和主线剧情。
   典型例子：角色在去营救女主的路上，用户点击“加速包”，插入汽车加速、超车、冲刺、避障的 AIGC 内容；插入结束后回到原片，角色仍按原剧情继续赶往营救地点。

4. none：
   普通对话、过渡剧情、信息铺垫、情绪不足、选择不明确、动作目标不明确、无法安全覆盖、无法安全插入、无法回到分支点、无法接回原剧情。

硬性判断规则：
- human_reviewed 必须输出 false；该字段留给人工审核后再改 true。
- 如果 interaction_type 是 高光弹幕 / 分支创建 / 动作互动，is_interactive 必须是 true。
- 三类互动都必须给具体 trigger_time 和 interaction_window，不能是 null。
- trigger_time 是互动触发锚点，必须是具体秒数。
- interaction_window 是互动持续时间段，必须包含 start/end/duration。
- interaction_window.duration = interaction_window.end - interaction_window.start，必须大于 0。
- trigger_time、interaction_window.start、interaction_window.end 必须落在当前 segment 的 start_time 到 end_time 范围内。
- must_not_change_main_plot 必须为 true。
- 如果无法找到可插入/覆盖的 interaction_window，或无法保证不影响主线剧情，必须判断为 none。

高光弹幕硬性规则：
- insert_position 必须是 overlay。
- interaction_window 是弹幕/贴纸/特效/音效持续覆盖时间，通常 2～5 秒，可随情绪持续适当延长。
- 只能覆盖展示，不能改变人物动作、台词、剧情信息和后续剧情。
- 必须输出 highlight_barrage，说明属于什么情绪点、用什么组件、什么 optionCode/label、什么特效。
- 不需要 branch_options，也不需要 action_interaction。
- continuity_safe 必须为 true，因为覆盖结束后继续播放原视频，不改变主线。

分支创建硬性规则：
- insert_position 必须是 before_decision。
- 必须发生在角色行动选择前，而不是行动已经发生后。
- 必须包含一个主线正确选择和至少一个非主线试错选择。
- 主线正确选择必须能够继续原片后续剧情。
- 非主线试错选择必须插入短 AIGC 失败/坏结果视频，用于侧面证明主线选择是正确的。
- 非主线试错分支结束后不能继续原片后续剧情，必须回到同一个分支点，让用户重新选择。
- 只有用户选择主线正确选项，才能继续播放原剧情。
- 非主线试错分支不能永久改变人物关系、关键道具、事件结果、剧情真相和主线走向。
- 必须输出 branch_mode="trial_and_error"。
- 必须输出 branch_point_time，通常等于 trigger_time。
- 必须输出 mainline_option。
- 必须输出 branch_options，且至少包含一个 branchOutcome="MAINLINE" 的主线选项和一个 branchOutcome="TRIAL" 的非主线试错选项。
- TRIAL/PREGEN 选项需要说明要生成什么试错分支视频，结束后用 retryTime 回到分支选择节点；MAINLINE 选项不需要 generationId。
- 如果无法构造“主线正确选择 + 非主线失败试错 + 回到分支点重选”的结构，必须判断为 none。

动作互动硬性规则：
- insert_position 必须是 during_action。
- 必须有明确动作目标，例如营救、追逐、逃跑、打斗、躲避、抢夺、破门、搜证、解锁、阻止、开车赶路、翻墙进入、寻找关键物品。
- 当前片段必须处于动作开始前、动作进行中，或动作过程的关键推进点。
- 用户操作必须能增强动作过程，例如加速包、连点助力、滑动躲避、点击攻击、长按蓄力、拖拽瞄准、快速解锁、选择路线、补充能量。
- 需要插入短 AIGC 动作增强视频，只能强化过程表现，不能改变原片动作结果。
- 插入结束后必须能无缝回到原片动作结果。
- 不能改变营救成败、追逐结果、打斗胜负、逃脱结果、关键道具归属、人物位置关系、剧情信息和主线结果。
- 必须输出 action_interaction。
- 如果只是普通移动、普通对话、动作已结束、只有情绪紧张，或无法接回原剧情，必须判断为 none。

none 硬性规则：
- 如果 is_interactive=false，interaction_type 必须是 none。
- 如果 interaction_type=none，is_interactive 必须是 false。
- trigger_time 必须是 null。
- interaction_window 必须是 null。
- insert_position 必须是 null。
- continuity_safe 必须是 false。
- branch_mode 必须是 null。
- branch_point_time 必须是 null。
- mainline_option 必须是空字符串。
- branch_options 必须是空数组。
- action_interaction 必须是空对象。
- highlight_barrage 必须是空对象。
- 不确定时降低 confidence 或判断为 none，不要强行标互动点。

待处理 segments：
{segment_specs}

只输出合法 JSON，不要输出自然语言解释，不要包裹 ```json。

输出 JSON 格式：
{{
  "segments": [
    {{
      "sample_id": "drama001_ep01_seg00000",
      "segment_id": "seg00000",
      "human_reviewed": false,
      "start_time": 0.0,
      "end_time": 10.0,
      "frame_timestamps": [2.5, 5.0, 7.5],

      "visual_caption": "一句话描述画面和人物状态",
      "action_caption": "人物动作、镜头动作、事件推进",
      "emotion_caption": "情绪氛围，用顿号分隔",
      "dialogue_summary": "结合台词后的剧情含义",
      "ocr_text": "画面可见文字，没有则为空",
      "characters": ["人物1", "人物2"],
      "location": "场景地点",
      "objects": ["关键物体"],
      "plot_functions": ["普通对话/反转/打脸/营救/追逐/选择前/危机/搞笑点等"],
      "retrieval_keywords": ["用于RAG检索的关键词"],

      "is_interactive": true,
      "interaction_type": "高光弹幕",
      "trigger_time": 5.0,
      "interaction_window": {{"start": 5.0, "end": 8.0, "duration": 3.0}},
      "insert_position": "overlay",
      "branch_mode": null,
      "branch_point_time": null,
      "mainline_option": "",
      "branch_options": [],
      "action_interaction": {{}},
      "highlight_barrage": {{
        "emotion_point": "爽点/搞笑/甜/名场面/反转等",
        "componentType": "emotion_button",
        "optionCode": "cool/famous_scene/funny/sweet",
        "label": "爽/名场面/笑出鹅叫/甜",
        "effect": "float/bubble",
        "highlightType": "高光弹幕",
        "emotionType": "COOL/FAMOUS/FUNNY/SWEET/TWIST"
      }},
      "continuity_safe": true,
      "must_not_change_main_plot": true,
      "resume_condition": "弹幕/特效覆盖结束后继续播放原视频，不改变人物动作、台词和剧情结果",
      "confidence": 0.82,
      "reason_type": "打脸",
      "requires_visual": false,
      "reason": "一句话说明为什么适合或不适合设置互动点"
    }}
  ]
}}
"""


CAPTION_PROMPT = """
你是短剧片段理解器。请同时参考【关键帧图片】【ASR台词】【字幕OCR】，输出结构化片段描述。

重要原则：
- 不要只看图片，必须结合台词理解剧情。
- ASR 台词优先，字幕 OCR 用于纠错和补充。
- 如果 ASR 和 OCR 冲突，结合画面判断，尽量给出更合理的剧情理解。
- 只输出 JSON，不要输出自然语言解释。

当前片段时间：{start_time} - {end_time}
关键帧时间戳：{frame_timestamps}
ASR台词：{dialogue}
字幕OCR：{subtitle_ocr_text}

输出 JSON 格式：
{{
  "visual_caption": "一句话描述画面和人物状态",
  "action_caption": "人物动作、镜头动作、事件推进",
  "emotion_caption": "情绪氛围，用顿号分隔",
  "dialogue_summary": "结合台词后的剧情含义",
  "ocr_text": "画面可见文字，没有则为空",
  "characters": ["人物1", "人物2"],
  "location": "场景地点",
  "objects": ["关键物体"],
  "plot_functions": ["普通对话/反转/打脸/营救/追逐/选择前/危机/搞笑点等"],
  "candidate_interaction_types": ["高光弹幕/分支创建/动作互动/none"],
  "retrieval_keywords": ["用于RAG检索的关键词"]
}}
"""


FEATURE_PROMPT = """
你是短剧互动点数据结构化助手。请根据片段信息补充用于判断器训练和 RAG 检索的特征。只输出 JSON。

片段信息：
前文：{previous_context}
台词：{dialogue}
视觉：{visual_caption}
动作：{action_caption}
情绪：{emotion_caption}
后文：{next_context}
互动类型：{interaction_type}
触发时间：{trigger_time}
互动持续窗口：{interaction_window}
插入位置：{insert_position}
是否能安全继续/回到分支点：{continuity_safe}
判断原因：{reason}

输出：
{{
  "has_emotion_peak": true,
  "has_clear_choice": false,
  "has_clear_action_goal": false,
  "has_insertable_window": true,
  "continuity_safe": true,
  "plot_functions": [],
  "action_types": [],
  "emotion_types": [],
  "candidate_types": [],
  "retrieval_keywords": []
}}
"""


JUDGE_PROMPT = """
你是短剧互动点判断与互动方案设计器。任务是判断片段是否适合设置互动点，并输出后续执行方案。
你不直接生成视频文件，但如果是“分支创建”或“动作互动”，必须写出可以交给视频生成 API/视频模型使用的中文 video_generation_prompt 和 target_duration。

后续落表和播放约定：
- interaction_window.start / interaction_window.end 会写入后端 highlight.start_time / highlight.end_time，前端播放到这个时间窗时触发对应互动组件。
- 高光弹幕只写 highlight，interaction_config.componentType 必须是 emotion_button，不需要生成 ai_generation。
- 分支创建先用 TRIAL/PREGEN 选项的 videoGenerationPrompt 和 targetDuration 生成 ai_generation，再把 generationId 写回 branch_choice 对应选项；MAINLINE 选项不需要 generationId，选择后继续原片。
- 动作互动先用 action_interaction.videoGenerationPrompt 和 targetDuration 生成 ai_generation，再把 generationId 写回 action_button；用户点击动作按钮后播放生成素材，播放结束后按 resumeTime 回到原片。
- targetDuration 是生成素材目标时长，不是原片时间窗长度；interaction_window 是前端展示/暂停/触发互动组件的时间窗。

互动类型：
1. 高光弹幕：
搞笑、爽点、打脸、反转、甜宠、社死、震惊等强情绪点；不改变剧情；需要一个持续展示时间段。
高光弹幕不插入新剧情，只做弹幕/贴纸/特效/音效 overlay 覆盖展示。

2. 分支创建：
角色处于明确行动选择前，存在一个主线正确选择和一个或多个非主线试错选择。
用户选择非主线时，需要插入短 AIGC 视频展示错误选择导致的不良后果，例如失败、暴露、受伤、错过时机、触发危机、被误导。
非主线分支结束后必须回到分支点，让用户重新选择。
只有选择主线正确选项，才能继续原片后续剧情。

只有满足以下条件才可判断为分支创建：
- 选择发生在角色行动前，而不是行动已经发生后。
- 至少有一个主线正确选择，该选择可以自然接回原片后续剧情。
- 至少有一个非主线试错选择，该选择会导致明确不良后果。
- 非主线试错分支必须侧面证明主线选择是正确的。
- 非主线试错分支结束后不能继续原片，必须回到分支点重新选择。
- 主线分支必须继续原剧情，不改变主线结果。
- 如果无法构造“主线正确选择 + 非主线失败试错 + 回到分支点”的结构，必须判断为 none。

3. 动作互动：
角色正在执行或即将执行明确动作目标，用户操作可以增强动作过程，并插入一段短 AIGC 动作增强视频。
动作互动只能强化过程表现，不能改变原片动作结果和主线剧情。

典型例子：角色在去营救女主的路上，用户点击“加速包”，插入汽车加速、超车、冲刺、避障的 AIGC 内容；插入结束后回到原片，角色仍按原剧情继续赶往营救地点。

只有满足以下条件才可判断为动作互动：
- 有明确动作目标，例如营救、追逐、逃跑、打斗、躲避、抢夺、破门、搜证、解锁、阻止、开车赶路、翻墙进入、寻找关键物品。
- 当前片段处于动作开始前、动作进行中，或动作过程的关键推进点。
- 用户操作能增强动作过程，例如加速包、连点助力、滑动躲避、点击攻击、长按蓄力、拖拽瞄准、快速解锁、选择路线、补充能量。
- 可以插入一段短 AIGC 视频表现动作增强过程。
- 插入 AIGC 内容后必须能无缝回到原片动作结果。
- 不能改变营救成败、追逐结果、打斗胜负、逃脱结果、关键道具归属、人物位置关系、剧情信息和主线结果。
- 如果只是普通移动、普通对话、动作已结束、只有情绪紧张，或无法接回原剧情，必须判断为 none。

4. none：
普通对话、过渡剧情、信息铺垫、情绪不足、选择不明确、动作目标不明确、无法安全覆盖、无法安全插入、无法回到分支点、无法接回原剧情。

相似案例：
{cases}

当前片段：
前文：{previous_context}
时间：{start_time} - {end_time}
关键帧时间戳：{frame_timestamps}
台词：{dialogue}
字幕OCR：{subtitle_ocr_text}
视觉：{visual_caption}
动作：{action_caption}
情绪：{emotion_caption}
剧情含义：{dialogue_summary}
后文：{next_context}

只输出合法 JSON，不要输出自然语言解释，不要包裹 ```json。

输出 JSON 格式：
{{
  "human_reviewed": false,
  "is_interactive": true,
  "interaction_type": "高光弹幕 | 分支创建 | 动作互动 | none",
  "trigger_time": 0.0,
  "interaction_window": {{"start": 0.0, "end": 0.0, "duration": 0.0}},
  "insert_position": "overlay | before_decision | during_action | null",
  "branch_mode": "trial_and_error | null",
  "branch_point_time": 0.0,
  "mainline_option": "主线正确选择；非分支创建时为空字符串",
  "branch_options": [
    {{
      "option": "主线选择",
      "optionCode": "mainline_choice",
      "branchOutcome": "MAINLINE",
      "is_mainline": true,
      "aigc_insert_intent": "表现主线正确选择的短过程，或直接继续原片",
      "outcome": "继续原剧情",
      "return_behavior": "continue_mainline"
    }},
    {{
      "option": "非主线试错选择",
      "optionCode": "trial_choice",
      "branchOutcome": "TRIAL",
      "is_mainline": false,
	      "generationMode": "PREGEN",
	      "generationId": null,
	      "retryTime": 0.0,
	      "targetDuration": 6.0,
	      "aigc_insert_intent": "生成错误选择导致失败/危机的短视频",
	      "videoGenerationPrompt": "给视频生成模型的中文提示词：生成一个短剧试错分支视频，说明错误选择、不良后果、画面动作、情绪氛围、结尾如何回到分支选择点",
	      "bad_outcome": "说明不良后果",
	      "proves_mainline_by": "说明它如何侧面证明主线选择正确",
	      "return_behavior": "return_to_branch_point"
    }}
  ],
	  "action_interaction": {{
	    "user_action": "用户操作，例如点击加速包",
	    "targetDuration": 6.0,
	    "aigc_insert_intent": "生成什么动作增强短视频",
	    "videoGenerationPrompt": "给视频生成模型的中文提示词：生成一个短剧动作增强视频，说明用户操作、动作增强过程、镜头表现、结尾如何接回原片",
	    "enhanced_process": "增强哪个主线动作过程",
	    "original_result_to_preserve": "必须保持不变的原片动作结果"
	  }},
  "highlight_barrage": {{
    "emotion_point": "爽点/搞笑/甜/名场面/反转等；非高光弹幕时为空对象",
    "componentType": "emotion_button",
    "optionCode": "cool/famous_scene/funny/sweet",
    "label": "爽/名场面/笑出鹅叫/甜",
    "effect": "float/bubble",
    "highlightType": "高光弹幕",
    "emotionType": "COOL/FAMOUS/FUNNY/SWEET/TWIST"
  }},
  "continuity_safe": true,
  "must_not_change_main_plot": true,
  "resume_condition": "插入/覆盖结束后如何继续原剧情，或非主线分支如何回到分支点",
  "confidence": 0.0,
  "reason_type": "简短原因类型",
  "requires_visual": false,
  "reason": "一句话判断依据"
}}

硬性规则：
- human_reviewed 必须输出 false；人工审核后才可改为 true。
- 如果 interaction_type 是 高光弹幕 / 分支创建 / 动作互动，is_interactive 必须是 true。
- 三类互动都必须给具体 trigger_time 和 interaction_window，不能是 null。
- trigger_time 是互动触发锚点，必须是具体秒数。
- interaction_window 必须是具体时间段，包含 start/end/duration。
- trigger_time 和 interaction_window.start/end 必须落在当前片段 start_time 到 end_time 之间。
- interaction_window.duration = end - start，必须大于 0。
- must_not_change_main_plot 必须为 true。
- 如果无法找到可插入/覆盖的 interaction_window，或无法保证不影响主线剧情，必须判断为 none。

高光弹幕规则：
- 高光弹幕 insert_position 必须是 overlay。
- 高光弹幕的 interaction_window 是弹幕/特效/贴纸/音效持续展示时间段，一般 2～5 秒。
- 高光弹幕只能覆盖展示，不能改变人物动作、台词、剧情信息和后续剧情。
- 高光弹幕不需要生成新剧情视频。
- 高光弹幕必须说明 highlight_barrage：情绪点、componentType、optionCode、label、effect；highlightType 固定为“高光弹幕”，情绪分类只能放在 emotionType 或 optionCode。
- 高光弹幕的 branch_mode 必须是 null，branch_point_time 必须是 null，mainline_option 必须为空字符串，branch_options 必须为空数组，action_interaction 必须为空对象。
- 高光弹幕 continuity_safe 必须为 true。

分支创建规则：
- 分支创建 insert_position 必须是 before_decision。
- 分支创建必须发生在角色行动选择前，而不是行动已经发生后。
- 分支创建必须包含一个主线正确选择和至少一个非主线试错选择。
- 主线正确选择必须能够继续原片后续剧情。
- 非主线试错选择必须插入短 AIGC 失败/坏结果视频，用于侧面证明主线选择是正确的。
- 非主线试错分支结束后不能继续原片后续剧情，必须回到同一个分支点，让用户重新选择。
- 只有用户选择主线正确选项，才能继续播放原剧情。
- 非主线试错分支不能永久改变人物关系、关键道具、事件结果、剧情真相和主线走向。
- 分支创建 branch_mode 必须是 trial_and_error。
- 分支创建 branch_point_time 必须是具体秒数，通常等于 trigger_time。
- 分支创建 mainline_option 不能为空。
- 分支创建 branch_options 至少包含一个 branchOutcome="MAINLINE" 的主线选项和一个 branchOutcome="TRIAL" 的非主线试错选项。
- MAINLINE 选项不需要 generationId，不切换视频；TRIAL/PREGEN 选项需要说明要生成什么试错分支视频，并用 retryTime 回到分支点。
- 每个 TRIAL/PREGEN 选项必须输出 targetDuration 和 videoGenerationPrompt。
- videoGenerationPrompt 必须写给视频生成模型看，包含：生成什么画面、人物动作、情绪氛围、不良后果、不能改变主线、结尾回到分支点。
- 分支创建 action_interaction 必须为空对象。
- 分支创建 highlight_barrage 必须为空对象。
- 如果无法构造“主线正确选择 + 非主线失败试错 + 回到分支点重选”的结构，必须判断为 none。

动作互动规则：
- 动作互动 insert_position 必须是 during_action。
- 动作互动必须有明确动作目标，例如营救、追逐、逃跑、打斗、躲避、抢夺、破门、搜证、解锁、阻止、开车赶路、翻墙进入、寻找关键物品。
- 当前片段必须处于动作开始前、动作进行中，或动作过程的关键推进点。
- 用户操作必须能增强动作过程，例如加速包、连点助力、滑动躲避、点击攻击、长按蓄力、拖拽瞄准、快速解锁、选择路线、补充能量。
- 动作互动需要插入短 AIGC 动作增强视频，只能强化过程表现，不能改变原片动作结果。
- 插入结束后必须能无缝回到原片动作结果。
- 不能改变营救成败、追逐结果、打斗胜负、逃脱结果、关键道具归属、人物位置关系、剧情信息和主线结果。
- 动作互动 action_interaction 不能为空对象。
- 动作互动 action_interaction 必须包含 targetDuration 和 videoGenerationPrompt。
- videoGenerationPrompt 必须写给视频生成模型看，包含：用户操作、生成什么动作增强视频、增强哪个过程、保持什么原片结果不变、结尾如何无缝接回原片。
- 动作互动 branch_mode 必须是 null，branch_point_time 必须是 null，mainline_option 必须为空字符串，branch_options 必须为空数组。
- 动作互动 highlight_barrage 必须为空对象。
- 如果只是普通移动、普通对话、动作已结束、只有情绪紧张，或无法接回原剧情，必须判断为 none。

none 规则：
- 如果 is_interactive=false，interaction_type 必须是 none。
- 如果 interaction_type=none，is_interactive 必须是 false。
- none 的 trigger_time 必须是 null。
- none 的 interaction_window 必须是 null。
- none 的 insert_position 必须是 null。
- none 的 branch_mode 必须是 null。
- none 的 branch_point_time 必须是 null。
- none 的 mainline_option 必须为空字符串。
- none 的 branch_options 必须为空数组。
- none 的 action_interaction 必须为空对象。
- none 的 highlight_barrage 必须为空对象。
- none 的 continuity_safe 必须是 false。
- none 的 resume_condition 应为空字符串。
- 不确定时降低 confidence 或判断为 none，不要强行标互动点。
"""
