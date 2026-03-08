import { auth } from '@clerk/nextjs/server';

export default async function GetUser() {
  const { userId } = await auth();
   return userId;
}