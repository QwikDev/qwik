import { useSignal, useTask$ } from "@builder.io/qwik";
import {
  getAllUsers,
  getUserByEmail,
  getUserByName,
  deleteUser,
  insertOrUpdateUser,
} from "../actions/user";

export const useGetUsers = () => {
  const signal = useSignal<Awaited<ReturnType<typeof getAllUsers>>>([]);
  useTask$(async () => {
    const result = await getAllUsers();
    signal.value = result;
  });
  return signal;
};

export const useGetUserByName = (name: string) => {
  const signal = useSignal<Awaited<ReturnType<typeof getUserByName>>>([]);
  useTask$(async () => {
    const result = await getUserByName(name);
    signal.value = result;
  });
  return signal;
};

export const useGetUserByEmail = (email: string) => {
  const signal = useSignal<Awaited<ReturnType<typeof getUserByEmail>>>([]);
  useTask$(async () => {
    const result = await getUserByEmail(email);
    signal.value = result;
  });
  return signal;
};

export const useDeleteUser = (name: string) => {
  const signal = useSignal<Awaited<ReturnType<typeof deleteUser>>>([]);
  useTask$(async () => {
    const result = await deleteUser(name);
    signal.value = result;
  });
  return signal;
};

export const useCreateOrUpdateUser = (name: string, email: string) => {
  const signal = useSignal<Awaited<ReturnType<typeof insertOrUpdateUser>>>([]);
  useTask$(async () => {
    const result = await insertOrUpdateUser(name, email);
    signal.value = result;
  });
  return signal;
};
