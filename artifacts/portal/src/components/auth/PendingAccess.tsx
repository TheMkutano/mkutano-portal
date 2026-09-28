import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PendingAccess() {
  const { logout } = useAuth();
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-gray-200">
        <CardHeader className="text-center pb-2">
          <h1 className="text-3xl font-heading font-bold text-gray-900 tracking-tight">MKUTANO</h1>
          <CardTitle className="text-xl mt-4">Access Pending</CardTitle>
          <CardDescription>Your account is waiting for administrator approval.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 mt-4">
          <p className="text-sm text-center text-gray-600 mb-4">
            You have successfully authenticated, but your profile has not been assigned a role or convening access yet. Please contact an administrator.
          </p>
          <Button variant="outline" className="w-full" onClick={logout}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
