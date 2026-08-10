import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import type { Env } from "../index";
import { getSupabase } from "../lib/supabase";

const auth = new Hono<{ Bindings: Env }>();

auth.post("/sync-user", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json<{
    id: string;
    name: string;
    email: string;
    photoUrl: string;
  }>();

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("id", body.id)
    .single();

  if (existing) {
    // Update name/photo if changed
    await supabase
      .from("users")
      .update({ name: body.name, photo_url: body.photoUrl })
      .eq("id", body.id);
    return c.json({
      user: {
        id: existing.id,
        name: body.name,
        email: existing.email,
        photoUrl: body.photoUrl,
        widgetId: existing.widget_id,
        createdAt: existing.created_at,
      },
    });
  }

  // Create new user with auto-generated widget_id
  const widgetId = uuidv4();
  const newUser = {
    id: body.id,
    name: body.name,
    email: body.email,
    photo_url: body.photoUrl,
    widget_id: widgetId,
    created_at: Date.now(),
  };

  const { error } = await supabase.from("users").insert(newUser);
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({
    user: {
      id: body.id,
      name: body.name,
      email: body.email,
      photoUrl: body.photoUrl,
      widgetId,
      createdAt: newUser.created_at,
    },
  });
});

export default auth;
