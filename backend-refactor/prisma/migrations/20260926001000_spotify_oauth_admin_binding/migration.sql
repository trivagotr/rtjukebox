-- AlterTable
ALTER TABLE "spotify_oauth_states" ADD COLUMN     "admin_user_id" UUID;

-- AddForeignKey
ALTER TABLE "spotify_oauth_states" ADD CONSTRAINT "spotify_oauth_states_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
