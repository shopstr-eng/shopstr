import { useState, useContext, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Button,
  Grid,
  Card,
  CardMedia,
  CardContent,
  Typography,
  IconButton,
  Link,
  Container,
  Box,
  useTheme,
  useMediaQuery,
  Divider,
  Chip,
  Paper
} from '@mui/material';
import {
  DarkMode,
  LightMode,
  GitHub,
  Twitter,
  ArrowForward,
  Security,
  CurrencyBitcoin,
  Lock,
  ShoppingCart,
  AccountCircle,
  Storefront,
  Payment,
  Forum,
  Speed,
  Public,
  CloudOff,
  PeopleAlt,
  Devices,
  Explore,
  LocalOffer,
  ArrowRightAlt
} from '@mui/icons-material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ProductContext } from '../utils/context/context';
import ProductCard from '@/components/utility-components/product-card';
import parseTags, { ProductData } from '@/components/utility/product-parser-functions';
import { SignerContext } from '@/utils/context/nostr-context';
import { nip19 } from 'nostr-tools';

const getDesignTokens = (mode: 'dark' | 'light') => ({
  palette: {
    mode,
    primary: {
      main: '#9c27b0',
    },
    secondary: {
      main: '#ffeb3b',
    },
    background: {
      default: mode === 'dark' ? '#000000' : '#ffffff',
      paper: mode === 'dark' ? '#121212' : '#f5f5f5',
    },
    text: {
      primary: mode === 'dark' ? '#ffffff' : '#000000',
      secondary: mode === 'dark' ? '#b3b3b3' : '#616161',
    },
  },
  typography: {
    fontFamily: 'Inter, sans-serif',
    allVariants: {
      color: mode === 'dark' ? '#ffffff' : '#000000',
    },
  },
});

export default function Landing() {
  const router = useRouter();
  const productEventContext = useContext(ProductContext);
  const signerContext = useContext(SignerContext);
  const [darkMode, setDarkMode] = useState(true);
  const [parsedProducts, setParsedProducts] = useState<ProductData[]>([]);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Dark Mode Toggle
  const shopstrTheme = createTheme(getDesignTokens(darkMode ? 'dark' : 'light'));

  useEffect(() => {
    if (router.pathname === "/" && signerContext.isLoggedIn) {
      router.push("/marketplace");
    }
  }, [router.pathname, signerContext]);

  useEffect(() => {
    const parsedProductsArray: ProductData[] = [];
    productEventContext.productEvents.forEach((product: any) => {
      const parsedProduct = parseTags(product) as ProductData;
      if (parsedProduct.images?.length > 0 && parsedProduct.currency && !parsedProduct.contentWarning) {
        parsedProductsArray.push(parsedProduct);
      }
    });
    setParsedProducts(parsedProductsArray);
  }, [productEventContext.productEvents]);

  // External resource links
  const externalResources = [
    {
      name: "Nostr",
      description: "A decentralized social protocol",
      icon: <Public />,
      link: "https://njump.me/",
      color: "#8e24aa"
    },
    {
      name: "Lightning",
      description: "Fast Bitcoin payments",
      icon: <CurrencyBitcoin />,
      link: "https://lightning.network/",
      color: "#fbc02d"
    },
    {
      name: "Cashu",
      description: "Private ecash for Bitcoin",
      icon: <Payment />,
      link: "https://cashu.space/",
      color: "#43a047"
    },
    {
      name: "Relays",
      description: "Infrastructure for Nostr",
      icon: <CloudOff />,
      link: "https://nostr.how/en/relays",
      color: "#0288d1"
    }
  ];

  return (
    <ThemeProvider theme={shopstrTheme}>
      <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
        {/* Header - Made sticky and responsive */}
        <AppBar position="sticky" color="transparent" elevation={0}>
          <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 6 } }}>
            <motion.div whileHover={{ scale: 1.05 }}>
              <Image
                src="/shopstr-2000x2000.png"
                alt="Shopstr"
                width={100}
                height={100}
                style={{ borderRadius: '8px' }}
              />
            </motion.div>
            <IconButton
              onClick={() => setDarkMode(!darkMode)}
              sx={{ color: 'text.primary' }}
            >
              {darkMode ? <LightMode /> : <DarkMode />}
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Hero Section - Fully responsive */}
        <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Typography variant="h1" sx={{
              mb: 2,
              color: 'primary.main',
              fontSize: { xs: '3rem', sm: '4rem', md: '5rem' },
              fontWeight: 900
            }}>
              Shop Freely.
            </Typography>
            <Typography variant="h5" sx={{ mb: 4, color: 'text.primary' }}>
              Decentralized Marketplace Powered by Nostr & Bitcoin
            </Typography>
            <motion.div whileHover={{ scale: 1.05 }}>
              <Button
                variant="contained"
                size="large"
                endIcon={<ShoppingCart />}
                onClick={() => router.push('/marketplace')}
                sx={{
                  px: 6,
                  py: 2,
                  bgcolor: 'primary.main',
                  '&:hover': { bgcolor: 'primary.dark' }
                }}
              >
                Explore Marketplace
              </Button>
            </motion.div>
          </motion.div>
        </Container>

        {/* Product Showcase */}
        <Container maxWidth="xl" sx={{ py: 8 }}>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <Typography variant="h3" align="center" gutterBottom sx={{
              color: 'text.primary',
              mb: 6,
              position: 'relative',
              '&:after': {
                content: '""',
                display: 'block',
                width: '60px',
                height: '4px',
                bgcolor: 'primary.main',
                mx: 'auto',
                mt: 2
              }
            }}>
              Featured Products
            </Typography>

            <Box sx={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              height: { xs: '350px', md: '400px' },
              '&::before, &::after': {
                content: '""',
                position: 'absolute',
                top: 0,
                width: '80px',
                height: '100%',
                zIndex: 2,
                pointerEvents: 'none',
              },
              '&::before': {
                left: 0,
                background: 'linear-gradient(90deg, rgba(18,18,18,1) 0%, rgba(18,18,18,0) 100%)',
                display: darkMode ? 'block' : 'none',
              },
              '&::after': {
                right: 0,
                background: 'linear-gradient(270deg, rgba(18,18,18,1) 0%, rgba(18,18,18,0) 100%)',
                display: darkMode ? 'block' : 'none',
              },
            }}>
              <motion.div
                style={{
                  display: 'flex',
                  gap: theme.spacing(3),
                }}
                animate={{
                  x: [`0px`, `-${Math.min(parsedProducts.length * 320, 2000)}px`], // Ensure both are strings
                }}
                transition={{
                  duration: 30,
                  repeat: Infinity,
                  repeatType: 'reverse',
                  ease: 'linear',
                }}
              >

                {parsedProducts.slice(0, 10).map((product, index) => (
                  <Box
                    key={`${product.id}-${index}`}
                    sx={{
                      minWidth: { xs: '280px', md: '320px' },
                      height: { xs: '320px', md: '380px' }
                    }}
                  >
                    <motion.div
                      whileHover={{
                        y: -8,
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                      }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <Card
                        sx={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          borderRadius: 2,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          bgcolor: 'background.paper',
                          transition: '0.3s'
                        }}
                        onClick={() =>
                          router.push(
                            `/listing/${nip19.naddrEncode({
                              identifier: product.d as string,
                              pubkey: product.pubkey,
                              kind: 30402,
                            })}`
                          )
                        }
                      >
                        <CardMedia
                          component="img"
                          height="180"
                          image={product.images?.[0] || '/placeholder-product.jpg'}
                          alt={product.title || 'Product'}
                          sx={{ objectFit: 'cover' }}
                        />
                        <CardContent sx={{ flexGrow: 1, p: 2 }}>
                          <Typography gutterBottom variant="h6" component="div" noWrap sx={{ fontWeight: 600 }}>
                            {product.title || 'Untitled Product'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            mb: 2
                          }}>
                            {/* {product.description || 'No description available'} */}
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
                              {product.price} {product.currency}
                            </Typography>
                            <IconButton
                              size="small"
                              sx={{
                                color: 'primary.main',
                                bgcolor: 'primary.main',
                                // color: 'white',
                                '&:hover': { bgcolor: 'primary.dark' }
                              }}
                            >
                              <ArrowForward fontSize="small" />
                            </IconButton>
                          </Box>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </Box>
                ))}
              </motion.div>
            </Box>

            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <motion.div whileHover={{ scale: 1.05 }}>
                <Button
                  variant="outlined"
                  size="large"
                  endIcon={<ArrowForward />}
                  onClick={() => router.push('/marketplace')}
                  sx={{
                    px: 4,
                    py: 1.5,
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    '&:hover': { borderColor: 'primary.dark', color: 'primary.dark' }
                  }}
                >
                  View All Products
                </Button>
              </motion.div>
            </Box>
          </motion.div>
        </Container>

        {/* ENHANCED: Why Shopstr? Section */}
        <Box sx={{
          py: 10,
          background: darkMode
            ? 'radial-gradient(circle at 50% 50%, #240046 0%, #121212 100%)'
            : 'radial-gradient(circle at 50% 50%, #f3e5f5 0%, #fff 100%)',
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <Container maxWidth="lg">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Typography
                variant="h2"
                align="center"
                gutterBottom
                sx={{
                  color: 'text.primary',
                  mb: 3,
                  fontWeight: 800,
                  background: darkMode
                    ? 'linear-gradient(90deg, #9c27b0 0%, #5e35b1 100%)'
                    : 'linear-gradient(90deg, #9c27b0 0%, #673ab7 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: darkMode ? '0 0 20px rgba(156, 39, 176, 0.3)' : 'none'
                }}
              >
                Why Shopstr?
              </Typography>
              <Typography
                variant="h6"
                align="center"
                paragraph
                sx={{
                  maxWidth: '800px',
                  mx: 'auto',
                  mb: 8,
                  color: darkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)',
                  px: { xs: 2, md: 0 }
                }}
              >
                Shopstr combines the best of decentralized technologies to create a censorship-resistant,
                private, and fee-minimal marketplace where anyone can transact freely without intermediaries.
              </Typography>
            </motion.div>

            <Grid container spacing={4}>
              {[
                {
                  title: 'True Decentralization',
                  content: 'No central authority controls your data or listings. Shopstr leverages Nostr, a decentralized protocol that ensures your store remains accessible even if individual relays go offline.',
                  icon: <CloudOff fontSize="large" />,
                  color: '#8e24aa',
                  features: ['Censorship-resistant', 'Self-sovereign identity', 'No single point of failure']
                },
                {
                  title: 'Bitcoin Native',
                  content: 'Instant, low-fee payments with Lightning Network and private transactions through Cashu. Your money stays yours, with no payment processors taking a cut of your sales.',
                  icon: <CurrencyBitcoin fontSize="large" />,
                  color: '#fbc02d',
                  features: ['Lightning Network fast', 'Minimal fees', 'Self-custodial']
                },
                {
                  title: 'Privacy First',
                  content: 'End-to-end encrypted communications protect your business conversations. Neither Shopstr nor any third party can access your private messages or transaction details.',
                  icon: <Lock fontSize="large" />,
                  color: '#43a047',
                  features: ['E2E encrypted messages', 'No KYC required', 'Privacy by design']
                },
                {
                  title: 'Global & Borderless',
                  content: 'Shopstr works anywhere in the world with an internet connection. No geographical restrictions, banking limitations, or currency conversion headaches.',
                  icon: <Public fontSize="large" />,
                  color: '#0288d1',
                  features: ['Cross-border commerce', 'Language independent', 'Accessible worldwide']
                }
              ].map((feature, index) => (
                <Grid item xs={12} md={6} component="div" key={feature.title}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    whileHover={{ y: -5 }}
                  >
                    <Paper
                      elevation={6}
                      sx={{
                        p: 4,
                        height: '100%',
                        borderRadius: 4,
                        background: darkMode
                          ? 'rgba(18, 18, 18, 0.7)'
                          : 'rgba(255, 255, 255, 0.9)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid',
                        borderColor: darkMode
                          ? 'rgba(255, 255, 255, 0.1)'
                          : 'rgba(0, 0, 0, 0.05)',
                        transition: 'all 0.3s ease',
                        position: 'relative',
                        overflow: 'hidden',
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '6px',
                          height: '100%',
                          backgroundColor: feature.color,
                        }
                      }}
                    >
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        mb: 2,
                        gap: 2
                      }}>
                        <Box sx={{
                          p: 1.5,
                          borderRadius: '12px',
                          bgcolor: `${feature.color}20`,
                          color: feature.color,
                          display: 'flex'
                        }}>
                          {feature.icon}
                        </Box>
                        <Typography
                          variant="h5"
                          gutterBottom
                          sx={{
                            fontWeight: 700,
                            color: 'text.primary',
                            mb: 0
                          }}
                        >
                          {feature.title}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body1"
                        paragraph
                        sx={{
                          color: 'text.secondary',
                          mb: 3
                        }}
                      >
                        {feature.content}
                      </Typography>
                      <Box sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1,
                        mb: 3
                      }}>
                        {feature.features.map(tag => (
                          <Chip
                            key={tag}
                            label={tag}
                            size="small"
                            sx={{
                              bgcolor: `${feature.color}15`,
                              color: feature.color,
                              borderRadius: '4px',
                              fontWeight: 500
                            }}
                          />
                        ))}
                      </Box>
                    </Paper>
                  </motion.div>
                </Grid>
              ))}
            </Grid>

            {/* Technology Resources */}
            <Box sx={{ mt: 8, textAlign: 'center' }}>
              <Typography
                variant="h4"
                gutterBottom
                sx={{
                  fontWeight: 700,
                  mb: 4,
                  color: 'text.primary'
                }}
              >
                Powered By Open Technologies
              </Typography>

              <Box sx={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 2,
                mx: 'auto',
                maxWidth: '900px'
              }}>
                {externalResources.map((resource) => (
                  <motion.div
                    key={resource.name}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      variant="contained"
                      startIcon={resource.icon}
                      endIcon={<ArrowRightAlt />}
                      onClick={() => window.open(resource.link, '_blank')}
                      sx={{
                        px: 3,
                        py: 1.5,
                        bgcolor: resource.color,
                        color: '#fff',
                        fontWeight: 600,
                        borderRadius: '10px',
                        textTransform: 'none',
                        '&:hover': {
                          bgcolor: resource.color,
                          filter: 'brightness(110%)',
                          boxShadow: `0 8px 16px -2px ${resource.color}50`
                        }
                      }}
                    >
                      {resource.name}
                      <Typography
                        component="span"
                        sx={{
                          ml: 1,
                          opacity: 0.8,
                          fontSize: '0.75rem',
                          display: { xs: 'none', sm: 'inline' }
                        }}
                      >
                        {resource.description}
                      </Typography>
                    </Button>
                  </motion.div>
                ))}
              </Box>
            </Box>
          </Container>

          {/* Decorative Elements */}
          {darkMode && (
            <>
              <Box sx={{
                position: 'absolute',
                width: '300px',
                height: '300px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(156,39,176,0.15) 0%, rgba(0,0,0,0) 70%)',
                top: '5%',
                left: '10%',
                zIndex: 0
              }} />
              <Box sx={{
                position: 'absolute',
                width: '400px',
                height: '400px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(66,165,245,0.1) 0%, rgba(0,0,0,0) 70%)',
                bottom: '5%',
                right: '10%',
                zIndex: 0
              }} />
            </>
          )}
        </Box>

        {/* How It Works */}
        <Box sx={{
          py: 10,
          bgcolor: darkMode ? '#121212' : '#f5f5f5',
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
        }}>
          <Container maxWidth="lg">
            <Typography
              variant="h3"
              align="center"
              sx={{
                color: 'text.primary',
                mb: 6,
                fontWeight: 600
              }}
            >
              How It Works
            </Typography>

            <Grid container spacing={6} justifyContent="center">
              {[
                {
                  step: "1",
                  title: "Generate new Nostr keys or sign in with an existing pair",
                  imageSrc: "/sign-in-step-dark.png"
                },
                {
                  step: "2",
                  title: "Set up your profile",
                  imageSrc: "/profile-step-dark.png"
                },
                {
                  step: "3",
                  title: "List your products",
                  imageSrc: "/listing-step-dark.png"
                },
                {
                  step: "4",
                  title: "Start buying and selling",
                  imageSrc: "/payment-step-dark.png"
                }
              ].map((item) => (
                <Grid item xs={12} sm={6} md={3} key={item.step}>
                  <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                  }}>
                    <Typography
                      variant="h2"
                      sx={{
                        mb: 2,
                        fontWeight: 'bold',
                        color: 'primary.main',
                        fontSize: { xs: '3rem', md: '3.5rem' }
                      }}
                    >
                      {item.step}
                    </Typography>

                    <Typography
                      variant="body1"
                      sx={{
                        mb: 4,
                        px: 2,
                        color: 'text.primary',
                        fontSize: { xs: '0.9rem', md: '1rem' },
                        height: { xs: 'auto', sm: '60px' },
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {item.title}
                    </Typography>

                    <Box
                      sx={{
                        border: '1px solid',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: 2,
                        overflow: 'hidden',
                        width: '100%',
                        maxWidth: '280px',
                        height: '230px',
                        position: 'relative',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        '& img': {
                          borderRadius: '8px'
                        }
                      }}
                    >
                      <Image
                        src={item.imageSrc}
                        alt={`Step ${item.step}`}
                        layout="fill"
                        objectFit="cover"
                      />
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ENHANCED: CTA Section */}
        <Box sx={{
          position: 'relative',
          py: { xs: 10, md: 14 },
          overflow: 'hidden',
          background: darkMode
            ? 'linear-gradient(135deg, #6a1b9a 0%, #4a148c 100%)'
            : 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)',
          color: 'white',
        }}>
          
          {/* Animated shape */}
          <Box sx={{
            position: 'absolute',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)',
            top: '-10%',
            right: '-5%',
            zIndex: 1
          }} />

          {/* Another animated shape */}
          <Box sx={{
            position: 'absolute',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)',
            bottom: '-10%',
            left: '-5%',
            zIndex: 1
          }} />

          <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 2 }}>
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={7}>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <Typography
                    variant="h2"
                    gutterBottom
                    sx={{
                      fontWeight: 900,
                      fontSize: { xs: '2.5rem', sm: '3rem', md: '3.5rem' },
                      textShadow: '0 2px 10px rgba(0,0,0,0.2)',
                      background: 'linear-gradient(90deg, #ffffff 0%, #e1bee7 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    Ready to Join the Free Market Revolution?
                  </Typography>

                  <Typography
                    variant="h6"
                    sx={{
                      mb: 4,
                      opacity: 0.9,
                      maxWidth: '600px',
                      lineHeight: 1.6,
                      fontSize: { xs: '1rem', md: '1.15rem' },
                    }}
                  >
                    Trade with anyone, anywhere in the world without gatekeepers, censorship, or middlemen.
                    Shopstr gives you the power to buy and sell on your own terms.
                  </Typography>

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 4 }}>
                    {[
                      { text: "No Platform Fees", icon: <LocalOffer fontSize="small" /> },
                      { text: "Own Your Identity", icon: <AccountCircle fontSize="small" /> },
                      { text: "Censorship Resistant", icon: <Security fontSize="small" /> },
                      { text: "Global Reach", icon: <Public fontSize="small" /> },
                    ].map((item, index) => (
                      <Chip
                        key={index}
                        icon={item.icon}
                        label={item.text}
                        sx={{
                          bgcolor: 'rgba(255,255,255,0.2)',
                          color: 'white',
                          fontWeight: 600,
                          borderRadius: '4px',
                          px: 2,
                          py: 1,
                        }}
                      />
                    ))}
                  </Box>

                  <motion.div whileHover={{ scale: 1.05 }}>
                    <Button
                      variant="contained"
                      size="large"
                      endIcon={<ArrowForward />}
                      onClick={() => router.push('/marketplace')}
                      sx={{
                        px: 6,
                        py: 2,
                        bgcolor: 'white',
                        color: 'primary.main',
                        fontWeight: 700,
                        '&:hover': { bgcolor: '#f3e5f5' },
                      }}
                    >
                      Join Now
                    </Button>
                  </motion.div>
                </motion.div>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Footer */}
        <Box
          sx={{
            py: 4,
            bgcolor: darkMode ? '#121212' : '#f5f5f5',
            textAlign: 'center',
            borderTop: '1px solid',
            borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            © {new Date().getFullYear()} Shopstr. All rights reserved.
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
}