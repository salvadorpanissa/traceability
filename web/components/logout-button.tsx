import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/logout";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost">
        Cerrar sesión
      </Button>
    </form>
  );
}
