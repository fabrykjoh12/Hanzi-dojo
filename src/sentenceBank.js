// Curated common-sentence bank for the Sentence Builder drill.
//
// The builder used to draw ONLY on per-word LLM \`example_sentence\` values,
// which were often stilted or used uncommon words. These are hand-written,
// everyday sentences — the kind a beginner actually hears and says — keyed by
// language|system|level. The builder prefers them and falls back to the vocab
// examples when a level has no bank yet.
//
// Each entry is { text, en }. Japanese is written with natural kanji so the
// word segmenter yields clean word tiles (all-kana fragments into single
// characters). Every sentence here was verified to tokenize to 3-8 content
// tiles with the app's Intl.Segmenter.

export const SENTENCE_BANK = {
  "chinese|hsk_3|1": [
    {
      "text": "我很好，谢谢。",
      "en": "I'm fine, thank you."
    },
    {
      "text": "今天天气很好。",
      "en": "The weather is nice today."
    },
    {
      "text": "这是我的书。",
      "en": "This is my book."
    },
    {
      "text": "他是我的朋友。",
      "en": "He is my friend."
    },
    {
      "text": "现在几点了？",
      "en": "What time is it now?"
    },
    {
      "text": "我爱我的家人。",
      "en": "I love my family."
    },
    {
      "text": "请给我一杯茶。",
      "en": "Please give me a cup of tea."
    },
    {
      "text": "我每天学习中文。",
      "en": "I study Chinese every day."
    },
    {
      "text": "你叫什么名字？",
      "en": "What is your name?"
    },
    {
      "text": "我们去吃饭。",
      "en": "We go eat."
    },
    {
      "text": "我有两个孩子。",
      "en": "I have two children."
    },
    {
      "text": "我喜欢看书。",
      "en": "I like reading."
    },
    {
      "text": "妈妈在做饭。",
      "en": "Mom is cooking."
    },
    {
      "text": "我会说一点中文。",
      "en": "I can speak a little Chinese."
    },
    {
      "text": "你想喝什么？",
      "en": "What do you want to drink?"
    },
    {
      "text": "我今天很忙。",
      "en": "I'm very busy today."
    },
    {
      "text": "我的老师是中国人。",
      "en": "My teacher is Chinese."
    },
    {
      "text": "我们是好朋友。",
      "en": "We are good friends."
    },
    {
      "text": "他不喜欢喝咖啡。",
      "en": "He doesn't like coffee."
    },
    {
      "text": "请坐这里。",
      "en": "Please sit here."
    },
    {
      "text": "我要回家了。",
      "en": "I'm going home."
    }
  ],
  "chinese|hsk_3|2": [
    {
      "text": "我坐公交车去学校。",
      "en": "I take the bus to school."
    },
    {
      "text": "明天我要考试。",
      "en": "I have an exam tomorrow."
    },
    {
      "text": "他跑得很快。",
      "en": "He runs very fast."
    },
    {
      "text": "我觉得有点累。",
      "en": "I feel a little tired."
    },
    {
      "text": "因为下雨，所以我在家。",
      "en": "Because it's raining, I stay home."
    },
    {
      "text": "我已经吃过饭了。",
      "en": "I have already eaten."
    },
    {
      "text": "请帮我开门。",
      "en": "Please help me open the door."
    },
    {
      "text": "他每天早上跑步。",
      "en": "He runs every morning."
    },
    {
      "text": "我们一起去旅游吧。",
      "en": "Let's travel together."
    },
    {
      "text": "这条裤子太贵了。",
      "en": "These pants are too expensive."
    },
    {
      "text": "你为什么迟到了？",
      "en": "Why were you late?"
    },
    {
      "text": "我最喜欢红色。",
      "en": "I like red the most."
    },
    {
      "text": "他正在打电话。",
      "en": "He is making a phone call."
    },
    {
      "text": "我身体不舒服。",
      "en": "I don't feel well."
    },
    {
      "text": "你可以慢一点说吗？",
      "en": "Can you speak a little slower?"
    },
    {
      "text": "我打算明年去中国。",
      "en": "I plan to go to China next year."
    },
    {
      "text": "虽然很难，但是很有意思。",
      "en": "Although it's hard, it's interesting."
    },
    {
      "text": "我们在门口等你。",
      "en": "We'll wait for you at the entrance."
    },
    {
      "text": "他把书放在桌子上。",
      "en": "He put the book on the table."
    },
    {
      "text": "你应该多休息。",
      "en": "You should rest more."
    },
    {
      "text": "我需要买一些水果。",
      "en": "I need to buy some fruit."
    },
    {
      "text": "火车马上就要开了。",
      "en": "The train is about to leave."
    },
    {
      "text": "她笑得很开心。",
      "en": "She smiled happily."
    },
    {
      "text": "这附近有银行吗？",
      "en": "Is there a bank nearby?"
    }
  ],
  "japanese|jlpt|1": [
    {
      "text": "私は学生です。",
      "en": "I am a student."
    },
    {
      "text": "これは何ですか。",
      "en": "What is this?"
    },
    {
      "text": "水をください。",
      "en": "Water, please."
    },
    {
      "text": "今何時ですか。",
      "en": "What time is it now?"
    },
    {
      "text": "私も行きます。",
      "en": "I'll go too."
    },
    {
      "text": "日本語が好きです。",
      "en": "I like Japanese."
    },
    {
      "text": "今日は暑いです。",
      "en": "It's hot today."
    },
    {
      "text": "もう一度お願いします。",
      "en": "Once more, please."
    },
    {
      "text": "映画を見ませんか。",
      "en": "Shall we watch a movie?"
    },
    {
      "text": "明日学校へ行きます。",
      "en": "I'll go to school tomorrow."
    },
    {
      "text": "私は肉を食べません。",
      "en": "I don't eat meat."
    },
    {
      "text": "友達と話します。",
      "en": "I talk with my friend."
    },
    {
      "text": "ちょっと待ってください。",
      "en": "Please wait a moment."
    },
    {
      "text": "これはいくらですか。",
      "en": "How much is this?"
    },
    {
      "text": "電車で会社へ行きます。",
      "en": "I go to the office by train."
    },
    {
      "text": "私は車が欲しいです。",
      "en": "I want a car."
    },
    {
      "text": "日本へ行きたいです。",
      "en": "I want to go to Japan."
    },
    {
      "text": "毎日コーヒーを飲みます。",
      "en": "I drink coffee every day."
    },
    {
      "text": "今日はいい天気です。",
      "en": "It's nice weather today."
    },
    {
      "text": "お名前は何ですか。",
      "en": "What is your name?"
    },
    {
      "text": "駅はどこですか。",
      "en": "Where is the station?"
    },
    {
      "text": "私は先生ではありません。",
      "en": "I am not a teacher."
    },
    {
      "text": "少し疲れました。",
      "en": "I'm a little tired."
    }
  ],
  "japanese|jlpt|3": [
    {
      "text": "趣味は漫画を書くことです。",
      "en": "My hobby is drawing manga."
    },
    {
      "text": "明日友達に会います。",
      "en": "I'll meet my friend tomorrow."
    },
    {
      "text": "もう宿題をしましたか。",
      "en": "Have you done your homework yet?"
    },
    {
      "text": "この道をまっすぐ行ってください。",
      "en": "Please go straight down this road."
    },
    {
      "text": "旅行の計画を立てています。",
      "en": "I'm making travel plans."
    },
    {
      "text": "天気がいいから散歩しましょう。",
      "en": "The weather is nice, so let's walk."
    },
    {
      "text": "私は英語を教えています。",
      "en": "I teach English."
    },
    {
      "text": "少し疲れたので休みたいです。",
      "en": "I'm tired, so I want to rest."
    },
    {
      "text": "新しい仕事に慣れました。",
      "en": "I've gotten used to my new job."
    },
    {
      "text": "駅まで歩いて十分です。",
      "en": "It's ten minutes on foot to the station."
    },
    {
      "text": "彼女は歌がとても上手です。",
      "en": "She is very good at singing."
    },
    {
      "text": "ゆっくり休んでください。",
      "en": "Please rest well."
    },
    {
      "text": "日本語が上手になりました。",
      "en": "My Japanese has improved."
    }
  ],
  "russian|russian|1": [
    {
      "text": "Меня зовут Анна.",
      "en": "My name is Anna."
    },
    {
      "text": "Я не понимаю.",
      "en": "I don't understand."
    },
    {
      "text": "Как тебя зовут?",
      "en": "What's your name?"
    },
    {
      "text": "Я живу в Москве.",
      "en": "I live in Moscow."
    },
    {
      "text": "Сколько это стоит?",
      "en": "How much does this cost?"
    },
    {
      "text": "Я хочу есть.",
      "en": "I want to eat."
    },
    {
      "text": "Где находится вокзал?",
      "en": "Where is the train station?"
    },
    {
      "text": "Сегодня хорошая погода.",
      "en": "The weather is nice today."
    },
    {
      "text": "Я люблю читать книги.",
      "en": "I love reading books."
    },
    {
      "text": "Мама готовит ужин.",
      "en": "Mom is cooking dinner."
    },
    {
      "text": "Я иду домой.",
      "en": "I'm going home."
    },
    {
      "text": "Он говорит по-русски.",
      "en": "He speaks Russian."
    },
    {
      "text": "Дайте мне воды, пожалуйста.",
      "en": "Give me some water, please."
    },
    {
      "text": "Мы живём вместе.",
      "en": "We live together."
    },
    {
      "text": "Я не знаю этого слова.",
      "en": "I don't know this word."
    },
    {
      "text": "Мой брат работает в банке.",
      "en": "My brother works at a bank."
    },
    {
      "text": "Она очень любит кофе.",
      "en": "She loves coffee very much."
    },
    {
      "text": "Извините, я опоздал.",
      "en": "Sorry, I'm late."
    },
    {
      "text": "Я учу русский язык.",
      "en": "I'm learning Russian."
    },
    {
      "text": "Это моя семья.",
      "en": "This is my family."
    },
    {
      "text": "Мне нужно купить хлеб.",
      "en": "I need to buy bread."
    },
    {
      "text": "Давай пойдём в парк.",
      "en": "Let's go to the park."
    },
    {
      "text": "Я очень устал сегодня.",
      "en": "I'm very tired today."
    },
    {
      "text": "Спасибо большое за помощь.",
      "en": "Thank you very much for the help."
    }
  ]
}

export function getSentenceBank(language, system, level) {
  return SENTENCE_BANK[language + '|' + system + '|' + level] || []
}
