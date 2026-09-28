import { NextResponse } from 'next/server'
export async function GET(){return NextResponse.json({ok:true,service:'mynh-erp-v5',architecture:'greenfield',trackingQuietHours:'02:00-06:00 Asia/Bangkok'})}
