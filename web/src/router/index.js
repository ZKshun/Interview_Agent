import { createRouter, createWebHistory } from "vue-router";
import UploadPage from "../views/UploadPage.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: UploadPage },
    {
      path: "/tasks/:id/process",
      component: () => import("../views/ProcessPage.vue"),
    },
    {
      path: "/tasks/:id/cards",
      component: () => import("../views/CardPage.vue"),
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
