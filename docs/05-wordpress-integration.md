# RadioTEDU - WordPress Integration

## Minimum Değişiklikler

WordPress'e sadece 2 meta alan eklenmeli ve REST API'de görünür yapılmalı.

### 1. functions.php Eki

`themes/your-theme/functions.php` dosyasına ekle:

```php
<?php
/**
 * RadioTEDU Podcast Meta Fields
 */

// Meta alanları kaydet
function radiotedu_register_podcast_meta() {
    register_post_meta('post', '_podcast_audio_url', [
        'show_in_rest' => true,
        'single' => true,
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'auth_callback' => function() {
            return current_user_can('edit_posts');
        }
    ]);

    register_post_meta('post', '_podcast_external_url', [
        'show_in_rest' => true,
        'single' => true,
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'auth_callback' => function() {
            return current_user_can('edit_posts');
        }
    ]);
}
add_action('init', 'radiotedu_register_podcast_meta');

// Admin edit sayfasında meta box
function radiotedu_podcast_meta_box() {
    add_meta_box(
        'radiotedu_podcast_urls',
        'Podcast URLs',
        'radiotedu_podcast_meta_box_html',
        'post',
        'side'
    );
}
add_action('add_meta_boxes', 'radiotedu_podcast_meta_box');

function radiotedu_podcast_meta_box_html($post) {
    $audio_url = get_post_meta($post->ID, '_podcast_audio_url', true);
    $external_url = get_post_meta($post->ID, '_podcast_external_url', true);
    wp_nonce_field('radiotedu_podcast_meta', 'radiotedu_nonce');
    ?>
    <p>
        <label>Audio URL (MP3):</label><br>
        <input type="url" name="_podcast_audio_url" value="<?php echo esc_attr($audio_url); ?>" style="width:100%">
    </p>
    <p>
        <label>Spotify/External URL:</label><br>
        <input type="url" name="_podcast_external_url" value="<?php echo esc_attr($external_url); ?>" style="width:100%">
    </p>
    <?php
}

function radiotedu_save_podcast_meta($post_id) {
    if (!isset($_POST['radiotedu_nonce']) || 
        !wp_verify_nonce($_POST['radiotedu_nonce'], 'radiotedu_podcast_meta')) {
        return;
    }
    if (isset($_POST['_podcast_audio_url'])) {
        update_post_meta($post_id, '_podcast_audio_url', esc_url_raw($_POST['_podcast_audio_url']));
    }
    if (isset($_POST['_podcast_external_url'])) {
        update_post_meta($post_id, '_podcast_external_url', esc_url_raw($_POST['_podcast_external_url']));
    }
}
add_action('save_post', 'radiotedu_save_podcast_meta');
```

### 2. REST API Response Örneği

```
GET /wp-json/wp/v2/posts?categories=PODCAST_CATEGORY_ID
```

```json
{
  "id": 123,
  "title": { "rendered": "Podcast Bölüm 5" },
  "excerpt": { "rendered": "..." },
  "featured_media": 456,
  "meta": {
    "_podcast_audio_url": "https://anchor.fm/.../audio.mp3",
    "_podcast_external_url": "https://open.spotify.com/episode/xyz"
  }
}
```

### 3. RSS Importer Güncellemesi (Opsiyonel)

Eğer otomatik import kullanılıyorsa, import hook'una ekle:

```php
function radiotedu_auto_fill_podcast_meta($post_id, $feed_item) {
    // RSS enclosure'dan audio URL
    if (!empty($feed_item['enclosure']['url'])) {
        update_post_meta($post_id, '_podcast_audio_url', $feed_item['enclosure']['url']);
    }
    // Link'ten external URL
    if (!empty($feed_item['link'])) {
        update_post_meta($post_id, '_podcast_external_url', $feed_item['link']);
    }
}
```

---

## Mobile App'te Kullanım

```typescript
interface Podcast {
  id: number;
  title: string;
  excerpt: string;
  featured_image: string;
  audio_url: string | null;  // _podcast_audio_url
  external_url: string;       // _podcast_external_url
  has_audio: boolean;
}

// Uygulama içi logic
if (podcast.audio_url) {
  // Uygulama içi player ile çal
  playInApp(podcast.audio_url);
}

// Her zaman göster
<Button onPress={() => Linking.openURL(podcast.external_url)}>
  Spotify'da Aç
</Button>
```
