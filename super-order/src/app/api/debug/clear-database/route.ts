import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/debug/clear-database - Clear all order data from database
export async function POST(request: NextRequest) {
  try {
    console.log('=== API: Clearing Database ===');
    
    // First delete all order events
    const deletedEvents = await prisma.orderEvent.deleteMany({});
    console.log(`Deleted ${deletedEvents.count} order events`);
    
    // Then delete all orders
    const deletedOrders = await prisma.order.deleteMany({});
    console.log(`Deleted ${deletedOrders.count} orders`);
    
    console.log('Database cleared successfully!');
    
    return NextResponse.json({
      success: true,
      message: 'Database cleared successfully',
      deletedOrders: deletedOrders.count,
      deletedEvents: deletedEvents.count,
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('=== API Error: Clearing Database ===');
    console.error('Error object:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to clear database', 
        details: error?.message 
      },
      { status: 500 }
    );
  }
}