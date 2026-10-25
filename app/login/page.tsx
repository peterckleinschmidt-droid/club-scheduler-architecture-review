import { LoginButton } from './login-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function Login({
  searchParams,
}: {
  searchParams?: Promise<{ changeAccount?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const changeAccount = params.changeAccount === '1';

  return (
    <div className="mx-auto max-w-md pt-10">
      <Card>
        <CardHeader>
          <CardTitle>{changeAccount ? 'Choose another account' : 'Sign in'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            {changeAccount
              ? 'Select the school Google account you want to use.'
              : 'Use your school Google account to continue.'}
          </p>
          <LoginButton selectAccount={changeAccount} />
        </CardContent>
      </Card>
    </div>
  );
}
