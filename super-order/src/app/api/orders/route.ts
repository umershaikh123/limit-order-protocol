import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/orders - Get all orders or filter by maker
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const maker = searchParams.get('maker');
    const status = searchParams.get('status');
    const orderType = searchParams.get('orderType');

    const where: any = {};
    if (maker) where.maker = maker.toLowerCase();
    if (status) where.status = status;
    if (orderType) where.orderType = orderType;

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        events: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Get last 5 events
        },
      },
    });

    return NextResponse.json(orders);
  } catch (error: any) {
    console.error('=== API Error: Fetching Orders ===');
    console.error('Error object:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    return NextResponse.json(
      { error: 'Failed to fetch orders', details: error?.message },
      { status: 500 }
    );
  }
}

// POST /api/orders - Create a new order
export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
    
    console.log('=== API: Creating Order ===');
    console.log('Request body:', body);
    
    // Create order with initial event
    const order = await prisma.order.create({
      data: {
        orderHash: body.orderHash,
        orderType: body.orderType,
        maker: body.maker.toLowerCase(),
        makerAsset: body.makerAsset,
        takerAsset: body.takerAsset,
        makingAmount: body.makingAmount,
        takingAmount: body.takingAmount,
        salt: body.salt,
        signature: body.signature,
        makerTraits: body.makerTraits || "0",
        makingAmountData: body.makingAmountData,
        takingAmountData: body.takingAmountData,
        triggerPrice: body.triggerPrice,
        isStopLoss: body.isStopLoss,
        maxSlippage: body.maxSlippage,
        maxPriceDeviation: body.maxPriceDeviation,
        createTxHash: body.createTxHash,
        events: {
          create: {
            eventType: 'created',
            txHash: body.createTxHash,
            data: {
              orderType: body.orderType,
              triggerPrice: body.triggerPrice,
            },
          },
        },
      },
      include: {
        events: true,
      },
    });

    console.log('Order created successfully:', order.id);
    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
    console.error('=== API Error: Creating Order ===');
    console.error('Error object:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Request body:', body);
    return NextResponse.json(
      { error: 'Failed to create order', details: error?.message },
      { status: 500 }
    );
  }
}

// PATCH /api/orders - Update order status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderHash, status, fillTxHash, filledAmount } = body;

    const order = await prisma.order.update({
      where: { orderHash },
      data: {
        status,
        fillTxHash: fillTxHash || undefined,
        filledAmount: filledAmount || undefined,
        executedAt: status === 'filled' ? new Date() : undefined,
        events: {
          create: {
            eventType: status,
            txHash: fillTxHash,
            data: { filledAmount },
          },
        },
      },
      include: {
        events: true,
      },
    });

    return NextResponse.json(order);
  } catch (error: any) {
    console.error('=== API Error: Updating Order ===');
    console.error('Error object:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Update data:', body);
    return NextResponse.json(
      { error: 'Failed to update order', details: error?.message },
      { status: 500 }
    );
  }
}