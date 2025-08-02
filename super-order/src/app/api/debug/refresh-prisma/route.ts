import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/debug/refresh-prisma - Refresh Prisma client connection
export async function POST(request: NextRequest) {
  try {
    console.log('=== API: Refreshing Prisma Client ===');
    
    // Disconnect and reconnect Prisma client
    await prisma.$disconnect();
    await prisma.$connect();
    
    // Test the connection with a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('Prisma connection test result:', result);
    
    console.log('Prisma client refreshed successfully!');
    
    return NextResponse.json({
      success: true,
      message: 'Prisma client refreshed successfully',
      connectionTest: result,
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('=== API Error: Refreshing Prisma Client ===');
    console.error('Error object:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to refresh Prisma client', 
        details: error?.message 
      },
      { status: 500 }
    );
  }
}