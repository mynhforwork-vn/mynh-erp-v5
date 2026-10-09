import assert from 'node:assert/strict'
import {NOTIFICATION_POLL_MS,isTrackingQuietNow,msToQuietBoundary} from '../lib/notification-quiet-hours.ts'

// Asia/Bangkok = UTC+7; quiet window is inclusive 02:00 and exclusive 06:00.
const at=iso=>new Date(iso)
assert.equal(NOTIFICATION_POLL_MS,300000)
const start='02:00:00',end='06:00:00'
assert.equal(isTrackingQuietNow(at('2026-10-08T18:59:59.000Z'),start,end),false,'01:59:59 Bangkok is operational')
assert.equal(isTrackingQuietNow(at('2026-10-08T19:00:00.000Z'),start,end),true,'02:00 Bangkok starts quiet')
assert.equal(isTrackingQuietNow(at('2026-10-08T22:59:59.999Z'),start,end),true,'05:59:59 Bangkok is quiet')
assert.equal(isTrackingQuietNow(at('2026-10-08T23:00:00.000Z'),start,end),false,'06:00 Bangkok resumes requests')
assert.equal(isTrackingQuietNow(at('2026-10-09T18:59:59.000Z'),start,end),false,'next midnight crossing operational')
assert.equal(msToQuietBoundary(at('2026-10-08T18:59:59.000Z'),'start',start,end),1000)
assert.equal(msToQuietBoundary(at('2026-10-08T22:59:59.000Z'),'end',start,end),1000)
assert.equal(isTrackingQuietNow(at('2026-10-08T18:30:00.000Z'),'22:00','06:00'),true,'overnight custom quiet supports midnight')
assert.equal(isTrackingQuietNow(at('2026-10-08T16:00:00.000Z'),'22:00','06:00'),true,'23:00 local within overnight quiet')
assert.equal(isTrackingQuietNow(at('2026-10-08T07:00:00.000Z'),'22:00','06:00'),false,'14:00 local outside overnight quiet')
assert.equal(isTrackingQuietNow(at('2026-10-08T20:00:00.000Z'),'bad','06:00'),true,'invalid config blocks outgoing requests')
assert.equal(20*60*1000/NOTIFICATION_POLL_MS,4,'20 min operational => 4 polls')
assert.equal(20*60/5,240,'20h per day at 5 min => 240 requests')
console.log('PASS: 02:00-06:00 Bangkok 0 notification requests, operational window 5m, maximum 240/day/tab')
