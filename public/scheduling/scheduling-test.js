var idleId
var ricOptions
var startDate
var lastEnd
var lastInterval
var min = Infinity
var max = Math.max()
var longestGap = 0
var avg = 0
var count = 0
const pageLoadStart = performance.now()

let animationElement

let heavyDrawRoundElement
/** heavyDraw 里需要循环多少次拖时间 */
let heavyDrawRound = 1000

let hasLogElement = false
let logElement
let shouldWriteDom = false
let shouldWriteDomElement

function printTickResult(suffix) {
  const current = performance.now()
  lastInterval = lastEnd ? current - lastEnd : false
  startDate = new Date()
  count++
  lastEnd = performance.now()
  printLog(suffix)
}

/**
 * 打印结果
 */
function printLog(suffix) {
  min = Math.min(lastInterval, min)
  max = Math.max(lastInterval, max)
  longestGap = Math.max(lastInterval, longestGap)
  avg = (avg * (count - 1) + lastInterval) / count

  const text =
    lastInterval !== false
      ? `[${currentScheduler.name}] ${count} Ran after ${round(lastInterval)}ms ${suffix} \n`
      : '[Start] Ran ' + startDate + '\n'

  shouldWriteDom = shouldWriteDomElement && shouldWriteDomElement.checked
  if (shouldWriteDom) {
    // 测试页面环境，写元素
    // 神奇的是，使用 requestIdleCallback 的时候如果进了这里，tick 时间会由 50ms 降到 17ms
    var node = document.createElement('span')
    node.appendChild(document.createTextNode(text))

    if (lastInterval === false) {
      node.className = 'entry-start'
    } else if (lastInterval > 2000) {
      node.className = 'entry-bad'
    }
    logElement.prepend(node)
    document.getElementById('status').textContent =
      'Average: ' +
      round(avg) +
      'ms | Min: ' +
      round(min) +
      'ms | Max: ' +
      round(max) +
      'ms | Count: ' +
      count +
      '\nLongest gap: ' +
      (longestGap > 3000
        ? round(longestGap / 1000, 1) + 's'
        : round(longestGap) + 'ms')
  } else {
    // 没有测试页面元素，打 log
    console.log(text)
  }
}

/** 通过在循环体里 forced layout 来模拟 JS 运行长的延迟 */
function heavyDraw() {
  if (!animationElement) return
  const elapsed = Date.now() - pageLoadStart
  const v = (elapsed / 10) % 300
  let i = 0
  while (i < heavyDrawRound) {
    i++
    animationElement.style.left = (v + Math.sqrt(i)) + "px"
    animationElement.offsetLeft
  }
}

class IdleCallbackScheduler {
  name = 'requestIdleCallback'
  idleId = 0
  start() {
    this.idleId = window.requestIdleCallback(this.work, ricOptions)
    return this.idleId
  }
  stop() {
    if (this.idleId) {
      window.cancelIdleCallback(this.idleId)
    }
    delete this.idleId
  }

  work = (deadline = {}) => {
    let suffix = ''
    if (deadline && deadline.didTimeout) {
      suffix = ', idle callback didTimeout'
      console.log('deadline didTimeout, timeRemaining', deadline.timeRemaining())
    }
    printTickResult(suffix)
    this.idleId = window.requestIdleCallback(this.work, ricOptions)
    heavyDraw()
  }
}

const idleCallbackScheduler = new IdleCallbackScheduler()

class RAFScheduler {
  name = 'requestAnimationFrame'
  frameId = 0

  start() {
    this.frameId = window.requestAnimationFrame(this.work)
    return this.frameId
  }
  stop() {
    if (this.frameId) {
      window.cancelAnimationFrame(this.frameId)
    }
    delete this.frameId
  }

  work = () => {
    printTickResult()
    this.frameId = window.requestAnimationFrame(this.work)
    heavyDraw()
  }
}

const rafScheduler = new RAFScheduler()

class TimeoutScheduler {
  name = 'setTimeout'
  timerId = 0
  start() {
    this.timerId = window.setTimeout(this.work, 0)
    return this.idleId
  }
  stop() {
    if (this.timerId) {
      window.clearTimeout(this.timerId)
    }
    delete this.timerId
  }

  work = () => {
    printTickResult()
    this.timerId = window.setTimeout(this.work, 0)
    heavyDraw()
  }
}

const timeoutScheduler = new TimeoutScheduler()

class ExperimentalScheduler {
  name = 'scheduler'
  timerId = 0
  controller = null
  isSupported = false
  isRunning = false

  constructor() {
    if (!window.scheduler) return
    this.isSupported = true
    this.controller = new TaskController()
  }

  start() {
    if (!this.isSupported) {
      console.error('scheduler not supported')
      alert('scheduler not supported')
      return
    }

    this.isRunning = true
    window.scheduler.postTask(this.work, {
      priority: 'user-visible',
      signal: this.controller.signal,
    })
  }
  stop() {
    if (!this.isSupported) return
    if (this.isRunning) {
      this.controller.abort()
      this.isRunning = false
      this.controller = new TaskController()
    }
  }

  work = () => {
    printTickResult()
    window.scheduler.postTask(this.work, {
      priority: 'user-visible',
      // priority: 'background',
      // delay: 90,
      signal: this.controller.signal,
    })
    heavyDraw()
  }
}

const experimentalScheduler = new ExperimentalScheduler()

function round(number, fixed) {
  return Number(number.toFixed(fixed || 0))
}

function start() {
  stop()
  if (ricOptions) ricOptions = null
  currentScheduler.start()
}

function startTimed() {
  stop()
  ricOptions = { timeout: 60 }
  currentScheduler.start()
}

function stop() {
  currentScheduler.stop()
  lastInterval = false

  const stat = `Average: ${round(avg)} | Min: ${round(min)} | Max: ${round(max)} | Longest gap: ${longestGap}`
  console.log(stat)
}


let currentScheduler = idleCallbackScheduler

window.onerror = function (msg) {
  var node = document.getElementById('error')
  node.textContent = msg
  node.className = 'alert alert-danger'
}

window.addEventListener('DOMContentLoaded', () => {
  logElement = document.getElementById('log')
  shouldWriteDomElement = document.getElementById('shouldWriteDom')
  const select = document.getElementById('schedulerName')

  const schedulerMap = {
    requestIdleCallback: idleCallbackScheduler,
    requestAnimationFrame: rafScheduler,
    setTimeout: timeoutScheduler,
    scheduler: experimentalScheduler,
  }

  select.addEventListener('change', (e) => {
    const name = e.target.value
    const scheduler = schedulerMap[name]
    if (scheduler) {
      console.log(`switch to ${scheduler.name}`)
      currentScheduler = scheduler
    }
  })

  animationElement = document.getElementById('animationObject')

  heavyDrawRoundElement = document.getElementById('heavyDrawRound')
  heavyDrawRoundElement.addEventListener('change', () => {
    heavyDrawRound = heavyDrawRoundElement.value
  })
})

window.start = start
window.stop = stop
window.startTimed = startTimed

window.clear = function() {
  console.log('clear')
  longestGap = 0
  min = 99999
  max = 0
  lastInterval = false
  lastEnd = false
  count = 0
  if (logElement) {
    logElement.innerHTML = ''
  }
}
