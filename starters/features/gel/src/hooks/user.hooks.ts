import { useSignal, useTask$ } from "@builder.io/qwik";
import { getAllUsers } from "../actions/user";

export const useGetUsers = () => {
  const signal = useSignal<Awaited<ReturnType<typeof getAllUsers>>>([]);
  useTask$(async () => {
    const result = await getAllUsers();
    signal.value = result;
  });
  return signal;
};
