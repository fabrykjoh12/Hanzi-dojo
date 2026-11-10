import { readFileSync } from 'fs'
const SR = await import('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/storyReading.js')
const c = {}
for (const f of process.argv.slice(2)) for (const st of JSON.parse(readFileSync(f,'utf8'))) for (const l of st.content.split('\n')) { const {speaker}=SR.splitSpeaker(l); if (speaker && /[说问想道喊叫答笑]$|[，。]/.test(speaker)) c[speaker+' ('+st.id+')']=1 }
console.log(Object.keys(c).length, Object.keys(c).slice(0,20).join(' | '))
