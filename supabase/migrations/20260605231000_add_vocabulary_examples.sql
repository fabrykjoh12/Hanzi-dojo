alter table public.vocabulary
add column if not exists example_sentence text,
add column if not exists example_reading text,
add column if not exists example_translation text;

update public.vocabulary
set example_sentence = '我是学生。',
    example_reading = 'Wo shi xuesheng.',
    example_translation = 'I am a student.'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 1
  and example_sentence is null;

update public.vocabulary
set example_sentence = '你好吗？',
    example_reading = 'Ni hao ma?',
    example_translation = 'How are you?'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 2
  and example_sentence is null;

update public.vocabulary
set example_sentence = '他在家。',
    example_reading = 'Ta zai jia.',
    example_translation = 'He is at home.'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 3
  and example_sentence is null;

update public.vocabulary
set example_sentence = '她是老师。',
    example_reading = 'Ta shi laoshi.',
    example_translation = 'She is a teacher.'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 4
  and example_sentence is null;

update public.vocabulary
set example_sentence = '我们在学校。',
    example_reading = 'Women zai xuexiao.',
    example_translation = 'We are at school.'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 5
  and example_sentence is null;

update public.vocabulary
set example_sentence = '今天是星期一。',
    example_reading = 'Jintian shi xingqi yi.',
    example_translation = 'Today is Monday.'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 6
  and example_sentence is null;

update public.vocabulary
set example_sentence = '我不忙。',
    example_reading = 'Wo bu mang.',
    example_translation = 'I am not busy.'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 7
  and example_sentence is null;

update public.vocabulary
set example_sentence = '这是我的书。',
    example_reading = 'Zhe shi wo de shu.',
    example_translation = 'This is my book.'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 8
  and example_sentence is null;

update public.vocabulary
set example_sentence = '我有一个朋友。',
    example_reading = 'Wo you yi ge pengyou.',
    example_translation = 'I have a friend.'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 9
  and example_sentence is null;

update public.vocabulary
set example_sentence = '我在北京。',
    example_reading = 'Wo zai Beijing.',
    example_translation = 'I am in Beijing.'
where language = 'chinese'
  and system = 'hsk_3'
  and level = 1
  and sort_order = 10
  and example_sentence is null;

notify pgrst, 'reload schema';
