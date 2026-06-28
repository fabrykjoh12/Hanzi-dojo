import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import './index.css'
import StoryReaderCN from './StoryReaderCN'
const vocab={'今天':{id:'1',word:'今天',reading:'jīn tiān',meaning:'today'},'天气':{id:'2',word:'天气',reading:'tiān qì',meaning:'weather'},'很':{id:'3',word:'很',reading:'hěn',meaning:'very'},'好':{id:'4',word:'好',reading:'hǎo',meaning:'good'},'学校':{id:'5',word:'学校',reading:'xué xiào',meaning:'school'},'高兴':{id:'6',word:'高兴',reading:'gāo xìng',meaning:'happy'},'我们':{id:'7',word:'我们',reading:'wǒ men',meaning:'we'},'说':{id:'8',word:'说',reading:'shuō',meaning:'to say'},'他':{id:'9',word:'他',reading:'tā',meaning:'he'},'去':{id:'10',word:'去',reading:'qù',meaning:'to go'}}
const story={title:'慢一点走',content:'今天星期一，天气很好。\n小明说：“我们去学校。”\n他很高兴。',english_content:'Today is Monday, the weather is nice.\nXiaoming said: "Let us go to school."\nHe is very happy.'}
function P(){const [uc,setUc]=useState({});return <StoryReaderCN story={story} vocabMap={vocab} userCards={uc} setUserCards={setUc} session={{user:{id:'x'}}} track={{language:'chinese',current_level:1,system:'hsk_3'}} onBack={()=>{}} nextStory={{title:'第二课'}} onNextStory={()=>{}} />}
createRoot(document.getElementById('root')).render(<P/>)
