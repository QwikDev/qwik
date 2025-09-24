import { useSignal, useTask$ } from "@qwik.dev/core";
import {
  getUsers,
} from "~/actions/user";

export const useGetUsers = () => {
  const signal = useSignal<Awaited<ReturnType<typeof getUsers>>>([]);
  useTask$(async () => {
    const result = await getUsers();
    signal.value = result;
  });
  return signal;
};