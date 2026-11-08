/** 幺筒快捷语：纯手动发送，男声本地 TTS 朗读 display text 或单独的 speech。 */
export interface QuickChatPhrase {
  readonly id: string
  readonly text: string
  /** TTS 文本；+、～ 等符号不朗读时单独给出。缺省读 text。 */
  readonly speech?: string
  /** 豆包 TTS 2.0 预生成的本地男声；缺省回退浏览器男声 TTS。 */
  readonly audio?: string
}

export interface QuickChatPage {
  readonly id: string
  readonly label: string
  readonly phrases: readonly QuickChatPhrase[]
}

/**
 * 两页十二槽。第一页是幺筒局真正会用的四句 + 通用催牌/夸奖/长考；
 * 第二页是朋友局气氛句，全部来自男声普通话包中适合牌桌的部分。
 */
export const QUICK_CHAT_PAGES: readonly QuickChatPage[] = [
  {
    id: 'common',
    label: '常用',
    phrases: [
      { id: 'follow', text: '能不能跟？', speech: '能不能跟', audio: 'sounds/chat-follow.ogg' },
      { id: 'listen', text: '听没听啊～', speech: '听没听啊', audio: 'sounds/chat-listen.ogg' },
      { id: 'draw', text: '这把赔不起，流局+1', speech: '这把赔不起，流局加一', audio: 'sounds/chat-draw.ogg' },
      { id: 'hurry', text: '快点吧，我等的花都谢了', audio: 'sounds/chat-hurry.ogg' },
      { id: 'praise', text: '你的牌打得太好了', audio: 'sounds/chat-praise.ogg' },
      { id: 'think', text: '让我再想想', audio: 'sounds/chat-think.ogg' },
    ],
  },
  {
    id: 'vibe',
    label: '气氛',
    phrases: [
      { id: 'hello', text: '大家好，很高兴见到各位', audio: 'sounds/chat-hello.ogg' },
      { id: 'stay', text: '朋友，不要走，再打几盘吧', audio: 'sounds/chat-stay.ogg' },
      { id: 'let-draw', text: '还让不让我摸牌啦', audio: 'sounds/chat-let-draw.ogg' },
      { id: 'feed-peng', text: '打一张来碰嘛', audio: 'sounds/chat-feed-peng.ogg' },
      { id: 'hurt', text: '来啊，互相伤害啊', audio: 'sounds/chat-hurt.ogg' },
      { id: 'oops-hu', text: '哎呀，一不小心就胡了', audio: 'sounds/chat-oops-hu.ogg' },
    ],
  },
] as const

/** 展平后用于校验/测试，发送时仍按页展示。 */
export const QUICK_CHAT_PHRASES: readonly QuickChatPhrase[] = QUICK_CHAT_PAGES.flatMap(page => page.phrases)
