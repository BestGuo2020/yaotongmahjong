<script setup lang="ts">
import { DISCLAIMER_SECTIONS, DISCLAIMER_TITLE } from '../content/disclaimer'
import yaotongRules from '../../docs/幺筒麻将规则-v1.0.md?raw'
defineProps<{ open: boolean }>()
defineEmits(['close'])
const rules = [
    ['牌具与癞子', '108张，万筒条各一至九，无字牌。不吃，可碰杠胡；碰牌三张同向，不指放碰者。一筒可作本牌或癞子。赖子按替代牌计鸡分，翻鸡前确认胡法；只有有取舍的赖子大牌提供并列胡牌按钮，翻后在确认方案内择高。'],
    ['胡牌资格', '鸡胡可自摸；普通点炮须有杠、报听或大牌资格。硬胡加10不单独提供点炮资格。鸡胡也可抢杠、接热炮，允许一炮多响。'],
    ['原报与报听', '发牌后、庄家第一次摸牌前可原报。本人此前未碰杠、未出牌，首次摸牌后先点报听，再打出带听牌提示的牌。声明后只能摸切，不能碰杠。'],
    ['基础与牌型', '基础5，碰碰胡10，清一色/金钩钓/七对20；龙七对/地龙40，双龙80，三龙120。硬胡10，原报40，报听/抢杠/热炮20。庄家天胡、闲家地胡各40，须本人此前未碰杠出牌且首次正常摸牌即自摸。素胡须门清自摸、无鸡无赖无杠，独立计25。'],
    ['鸡与冲幺筒', '一条、八筒、一万各自首冲4分；本人首张可同种跟冲4分。幺筒预冲30、普通首冲20、后冲15、杠冲100；预冲不占普通首冲。手中作本牌的幺筒每张10。每种鸡的全场首张留在牌河时横放，被取走后不递补。'],
    ['翻鸡与见面礼', '胡后有剩余牌才翻鸡，同花色加一，九回一。翻中固定鸡或幺筒，对应鸡分三倍。结算仍归本人四张幺筒，其他三家各付100见面礼。未听赔鸡仅按牌河和碰杠中的固定鸡、幺筒原档，不赔翻鸡新增分。骰子同点，全部适用分数双倍。'],
    ['行为判罚', '一巡内同种鸡牌不得碰打、打碰。合法胡牌选过到下次实际摸牌解除；变大且达到45分可例外。可杀报却不胡，或手持幺筒不抢杠/接热炮，会包牌。'],
    ['新手与老手模式', '新手模式由系统拦截违规操作，必须胡牌时仅保留胡牌选择；老手模式可随时主动宣胡，过手或炸胡等违规按规则包牌。两种模式的计分规则与 AI 对手相同。'],
    ['行牌与等待', '普通弃牌至少留1秒，补杠、杠后首张及幺筒留2秒。老手常驻等，每人每小局累计15秒；下一张出牌前仍可等后胡上一张，主动过才立即记过手。抢杠、热炮优先于过手。错胡按炸胡包牌。'],
    ['荒庄与包牌', '未听者杠分按原付款关系反赔对应听牌者，双方未听不互付；荒庄另向每位听者付牌型价＋本家应赔出鸡。包牌取全场最高听牌型价、最低45，向其他三家支付；按v1.6暂行约定不另结杠分和见面礼。'],
    ['场次与轮庄', '东风/半庄/全庄分别4/8/16庄次，连庄不增加庄次。单胡赢家庄，多响放炮庄；流局仅一人未听则由其坐庄，其余留庄。'],
  ]
</script>

<template>
  <Transition name="panel">
    <aside v-if="open" class="rules-panel">
      <header>
        <div>
          <h2>幺筒麻将 · v1.7</h2>
        </div>
        <button aria-label="关闭规则" @click="$emit('close')">×</button>
      </header>
      <div class="rule-list">
        <article v-for="(rule, index) in rules" :key="rule[0]">
          <b>{{ String(index + 1).padStart(2, '0') }}</b>
          <div>
            <h3>{{ rule[0] }}</h3><p>{{ rule[1] }}</p>
          </div>
        </article>
      </div>
      <details class="yaotong-source"><summary>查看完整规则原文</summary><pre>{{ yaotongRules }}</pre></details>
      <div class="rule-note">四家净分之和为0 · 鸡、杠、责任、见面礼逐项记账</div>
      <section class="disclaimer-block" aria-label="用户声明">
        <h3>{{ DISCLAIMER_TITLE }}</h3>
        <template v-for="(section, index) in DISCLAIMER_SECTIONS" :key="index">
          <h4 v-if="section.title">{{ section.title }}</h4>
          <p v-if="section.body">{{ section.body }}</p>
          <ol v-if="section.list?.length">
            <li v-for="(item, itemIndex) in section.list" :key="itemIndex">{{ item }}</li>
          </ol>
        </template>
      </section>
    </aside>
  </Transition>
</template>

<style scoped>
.yaotong-source{padding:16px;color:var(--theme-text);font-size:12px}.yaotong-source summary{cursor:pointer;color:var(--theme-accent-text)}.yaotong-source pre{white-space:pre-wrap;font:11px/1.8 inherit;overflow-wrap:anywhere}
</style>
