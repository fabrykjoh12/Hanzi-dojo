import { BookOpen, Brush, Clapperboard, MessageCircle, MessageCircleReply } from 'lucide-react'
import { presentationOf } from './readerMode'

export default function StoryFormatIcon({ story, size = 16, color = 'currentColor' }) {
  const presentation = presentationOf(story)
  let Icon = BookOpen
  if (presentation === 'manhua') Icon = Brush
  else if (story?.interactions) Icon = MessageCircleReply
  else if (presentation === 'chat') Icon = MessageCircle
  else if (presentation === 'scene') Icon = Clapperboard
  return <Icon size={size} strokeWidth={1.9} color={color} aria-hidden="true" />
}
