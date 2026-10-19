<script setup lang="ts">
defineProps<{ kind: 'rush' | 'responsibility'; uid: string }>()
</script>

<template>
  <svg class="chicken-actor" :class="kind" viewBox="0 0 200 170" aria-hidden="true">
    <defs>
      <radialGradient :id="`${uid}-body`" cx=".35" cy=".25" r=".8">
        <stop stop-color="#fffbd1" />
        <stop offset=".4" stop-color="#ffe979" />
        <stop offset="1" stop-color="#e5a336" />
      </radialGradient>
      <linearGradient :id="`${uid}-helmet`" x2=".2" y2="1">
        <stop stop-color="#b9cf9b" />
        <stop offset=".5" stop-color="#637c50" />
        <stop offset="1" stop-color="#344a33" />
      </linearGradient>
      <radialGradient :id="`${uid}-roast`" cx=".35" cy=".2" r=".8">
        <stop stop-color="#ffd78c" />
        <stop offset=".45" stop-color="#d6873b" />
        <stop offset="1" stop-color="#8e411d" />
      </radialGradient>
    </defs>
    <ellipse class="ground-shadow" cx="103" cy="147" rx="62" ry="10" fill="#102b2b" opacity=".25" />
    <g class="dust" fill="#fff0c4">
      <ellipse cx="34" cy="140" rx="15" ry="8" />
      <ellipse cx="16" cy="133" rx="10" ry="7" />
      <ellipse cx="43" cy="128" rx="9" ry="7" />
    </g>
    <g class="living-chicken">
      <g class="legs" stroke="#c4782d" stroke-width="6" stroke-linecap="round" fill="none">
        <path class="leg rear-leg" d="M91 125 L82 142 L97 146 M82 142 L76 148" />
        <path class="leg front-leg" d="M121 124 L135 141 L150 142 M135 141 L137 150" />
      </g>
      <g class="chicken-bob">
        <path
          d="M64 86 Q24 46 32 82 Q8 69 27 94 Q12 103 56 111"
          fill="#456759"
          stroke="#294c46"
          stroke-width="2"
        />
        <ellipse
          cx="97"
          cy="100"
          rx="55"
          ry="35"
          :fill="`url(#${uid}-body)`"
          stroke="#daaa4b"
          stroke-width="1.5"
        />
        <g class="head">
          <path
            d="M130 43 Q113 22 126 20 Q134 18 138 30 Q143 5 153 16 Q157 23 152 37 Q171 22 175 35 L161 53"
            fill="#df624d"
            stroke="#ac4536"
            stroke-width="2"
          />
          <path d="M149 91 Q169 117 156 121 Q145 123 143 98" fill="#dd5a49" />
          <ellipse
            cx="144"
            cy="68"
            rx="33"
            ry="35"
            :fill="`url(#${uid}-body)`"
            stroke="#dca74c"
            stroke-width="1.5"
          />
          <path d="M166 70 Q184 70 190 78 Q180 87 166 85Z" fill="#efa343" stroke="#be792d" stroke-width="2" />
          <path d="M169 79 L186 79" stroke="#b87628" stroke-width="2" />
          <ellipse cx="150" cy="64" rx="13" ry="17" fill="#fffef3" />
          <ellipse class="eye" cx="155" cy="66" rx="5.5" ry="9" fill="#253a39" />
          <circle cx="157" cy="62" r="2" fill="white" />
          <ellipse cx="135" cy="83" rx="8" ry="4.5" fill="#edb07c" opacity=".65" />
          <path
            class="brow"
            d="M142 44 Q151 40 160 45"
            stroke="#856236"
            stroke-width="3"
            fill="none"
            stroke-linecap="round"
          />
          <g class="helmet">
            <path
              d="M109 56 Q106 22 138 23 Q165 24 169 51Z"
              :fill="`url(#${uid}-helmet)`"
              stroke="#3a5437"
              stroke-width="2"
            />
            <path
              d="M105 55 Q133 46 175 52 L176 58 Q137 54 107 62Z"
              fill="#465f3e"
              stroke="#30482e"
              stroke-width="2"
            />
            <path
              d="M132 25 Q119 29 117 43"
              stroke="#d5e1b5"
              stroke-width="4"
              opacity=".65"
              fill="none"
              stroke-linecap="round"
            />
            <path
              d="M142 35 L145 40 L151 40 L146 44 L148 50 L142 47 L137 50 L138 44 L133 40 L140 40Z"
              fill="#e7d690"
            />
          </g>
        </g>
        <path
          class="wing"
          d="M96 81 Q127 84 112 112 Q99 121 74 105 Q82 99 86 94 Q85 89 96 81Z"
          fill="#f6cd5b"
          stroke="#d4a13b"
          stroke-width="2"
        />
        <path class="wing-detail" d="M80 103 Q98 113 105 105" fill="none" stroke="#fff0a3" stroke-width="3" />
      </g>
    </g>
    <g class="roast-chicken">
      <ellipse cx="103" cy="137" rx="67" ry="17" fill="#afc9ce" />
      <ellipse cx="103" cy="132" rx="67" ry="17" fill="#fcf4dc" stroke="#e0dcc6" stroke-width="2" />
      <ellipse cx="103" cy="132" rx="52" ry="11" fill="#d8bd83" />
      <path
        d="M54 128 Q55 83 104 85 Q149 90 149 129 Q101 145 54 128"
        :fill="`url(#${uid}-roast)`"
        stroke="#a65c28"
        stroke-width="2"
      />
      <path
        d="M61 113 Q47 91 40 101 Q35 113 61 128 M141 112 Q159 92 164 103 Q167 116 143 130"
        :fill="`url(#${uid}-roast)`"
        stroke="#a65c28"
        stroke-width="3"
      />
      <path d="M69 99 Q83 91 96 95" stroke="#ffe3a3" stroke-width="5" stroke-linecap="round" fill="none" />
      <ellipse cx="82" cy="125" rx="15" ry="11" fill="#e6a154" />
      <ellipse cx="121" cy="125" rx="15" ry="11" fill="#dc9146" />
      <g stroke="#fff1cf" stroke-width="7" stroke-linecap="round">
        <path d="M76 128 L66 141 M128 128 L138 141" />
      </g>
      <g fill="#fff1cf">
        <circle cx="63" cy="142" r="5" />
        <circle cx="68" cy="145" r="5" />
        <circle cx="136" cy="144" r="5" />
        <circle cx="142" cy="141" r="5" />
      </g>
      <g class="steam" fill="none" stroke="#fff6db" stroke-width="4" stroke-linecap="round" opacity=".8">
        <path d="M84 78 Q71 66 84 54 Q96 42 84 32" />
        <path d="M120 80 Q106 65 119 55 Q132 44 120 34" />
      </g>
    </g>
    <g class="poof" fill="#fff3d1">
      <circle cx="105" cy="80" r="31" />
      <circle cx="76" cy="95" r="27" />
      <circle cx="131" cy="104" r="29" />
      <circle cx="109" cy="124" r="25" />
    </g>
    <g class="feathers" fill="#fff1b2">
      <path d="M29 70 Q12 37 38 47 Q49 60 29 70" />
      <path d="M159 115 Q191 97 180 127 Q163 137 159 115" />
      <path d="M99 30 Q89 1 109 13 Q118 28 99 30" />
    </g>
  </svg>
</template>

<style scoped>
.chicken-actor {
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 5px 3px #142a3040);
}
.leg {
  transform-box: fill-box;
  transform-origin: 50% 0;
  animation: chicken-stride 0.18s linear 6 alternate;
}
.rear-leg {
  animation-direction: alternate-reverse;
}
.chicken-bob {
  transform-origin: 100px 135px;
  animation: chicken-bob 0.18s ease-in-out 6 alternate;
}
.wing,
.wing-detail {
  transform-origin: 95px 90px;
  animation: chicken-wing 0.18s linear 6 alternate;
}
.head {
  transform-origin: 141px 91px;
  animation: chicken-look 1.8s ease-in-out both;
}
.dust {
  transform-origin: 38px 140px;
  animation: chicken-dust 0.3s ease-out 4;
  opacity: 0;
}
.roast-chicken,
.poof,
.feathers {
  opacity: 0;
}
.responsibility .helmet {
  display: none;
}
.responsibility .living-chicken {
  animation: chicken-surprise 1.8s ease-out both;
  transform-origin: 105px 135px;
}
.responsibility .head {
  animation: chicken-gasp 1.8s ease-out both;
}
.responsibility .eye {
  transform-origin: 155px 66px;
  animation: chicken-gasp 1.8s ease-out both;
}
.responsibility .roast-chicken {
  animation: chicken-roast 1.8s ease-out both;
  transform-origin: 103px 137px;
}
.responsibility .poof {
  animation: chicken-poof 1.8s ease-out both;
  transform-origin: 103px 110px;
}
.responsibility .feathers {
  animation: chicken-feathers 1.8s ease-out both;
  transform-origin: 103px 110px;
}
.responsibility .steam {
  animation: chicken-steam 0.65s 0.8s ease-in-out 2 alternate;
}
@keyframes chicken-stride {
  to {
    transform: rotate(38deg) translateY(-2px);
  }
}
@keyframes chicken-bob {
  to {
    transform: translateY(-5px) rotate(-4deg);
  }
}
@keyframes chicken-wing {
  to {
    transform: rotate(-22deg);
  }
}
@keyframes chicken-look {
  0%,
  50% {
    transform: rotate(4deg);
  }
  65% {
    transform: rotate(-16deg);
  }
  80%,
  100% {
    transform: rotate(-7deg);
  }
}
@keyframes chicken-dust {
  15% {
    opacity: 0.6;
  }
  100% {
    opacity: 0;
    transform: translateX(-22px) scale(1.4);
  }
}
@keyframes chicken-surprise {
  0%,
  24% {
    opacity: 1;
  }
  34% {
    transform: translateY(-18px) rotate(-10deg);
    opacity: 1;
  }
  43% {
    opacity: 1;
    transform: scale(1.12, 0.85);
  }
  48%,
  100% {
    opacity: 0;
  }
}
@keyframes chicken-gasp {
  25% {
    transform: scale(1);
  }
  35%,
  100% {
    transform: scale(1.18);
  }
}
@keyframes chicken-roast {
  0%,
  43% {
    opacity: 0;
    transform: scale(0.6);
  }
  55% {
    opacity: 1;
    transform: scale(1.12);
  }
  64%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes chicken-poof {
  0%,
  38% {
    opacity: 0;
    transform: scale(0.3);
  }
  47% {
    opacity: 0.95;
    transform: scale(1.1);
  }
  63%,
  100% {
    opacity: 0;
    transform: scale(1.6);
  }
}
@keyframes chicken-feathers {
  0%,
  42% {
    opacity: 0;
    transform: scale(0.4);
  }
  52% {
    opacity: 1;
  }
  80%,
  100% {
    opacity: 0;
    transform: scale(1.6) rotate(20deg) translateY(12px);
  }
}
@keyframes chicken-steam {
  to {
    transform: translateY(-8px);
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chicken-actor * {
    animation: none !important;
  }
  .dust,
  .poof,
  .feathers {
    display: none;
  }
  .responsibility .living-chicken {
    opacity: 0;
  }
  .responsibility .roast-chicken {
    opacity: 1;
  }
}
</style>
